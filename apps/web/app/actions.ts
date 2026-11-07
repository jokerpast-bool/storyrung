"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  BUCKETS,
  bandSummary,
  estimateConfidence,
  estimateVocabSize,
  levelFromVocab,
  type BandAccuracy,
} from "@/lib/domain/level";
import { PREP_LIMITS } from "@/lib/domain/prep";
import type { Grade } from "@/lib/domain/srs";
import { gradeLevelTest } from "@/lib/services/level-test";
import { applyAttempt } from "@/lib/services/prep-session";
import { applyGrade } from "@/lib/services/review";
import { getDemoUser, getVocabStates } from "@/lib/services/user";
import { lookupLemma } from "@/lib/services/chapter";

export interface LevelTestResult {
  vocabSize: number;
  level: "cet4" | "cet6";
  confidence: number;
  correctCount: number;
  total: number;
  bands: ReturnType<typeof bandSummary>;
}

/**
 * 词汇量测评提交：四选一判分 → 扣掉猜对率估词汇量 → 定级 → 答错的词落成 unknown。
 * 返回结果给客户端渲染结果页（不跳转，避免状态丢失）。
 */
export async function submitLevelTest(
  answers: { itemId: string; chosen: string }[],
): Promise<LevelTestResult> {
  const user = await getDemoUser();
  const graded = await gradeLevelTest(answers);

  const bands: BandAccuracy[] = BUCKETS.map((bucket) => ({ band: bucket.band, total: 0, correct: 0 }));
  for (const row of graded) {
    const band = bands.find((b) => b.band === row.item.band);
    if (!band) continue;
    band.total += 1;
    if (row.correct) band.correct += 1;
  }

  const vocabSize = estimateVocabSize(bands);
  const confidence = estimateConfidence(bands);
  const level = levelFromVocab(vocabSize);
  const correctCount = graded.filter((row) => row.correct).length;

  await prisma.user.update({
    where: { id: user.id },
    data: { vocabSize, level, levelConfidence: confidence },
  });

  // 答错的词直接落 unknown：进书库后这些词会更早出现在预习包里
  for (const row of graded) {
    if (row.correct) continue;
    await prisma.userVocabState.upsert({
      where: { userId_lemma: { userId: user.id, lemma: row.item.lemma } },
      update: { status: "unknown", mastery: 0.15, source: "test", lastSeenAt: new Date() },
      create: {
        userId: user.id,
        lemma: row.item.lemma,
        status: "unknown",
        mastery: 0.15,
        source: "test",
      },
    });
  }

  revalidatePath("/library");
  revalidatePath("/level-test");

  return {
    vocabSize,
    level,
    confidence,
    correctCount,
    total: graded.length,
    bands: bandSummary(bands),
  };
}

export interface AttemptResult {
  mastery: number;
  prepScore: number;
  unlocked: boolean;
  coverageAfter: number;
}

/** 预习作答：业务逻辑在 lib/services/prep-session.ts，这里只做动作绑定与页面刷新。 */
export async function recordAttempt(input: {
  chapterId: string;
  lemma: string;
  exerciseType: "recognize" | "cloze" | "spell";
  correct: boolean;
  latencyMs: number;
}): Promise<AttemptResult> {
  const user = await getDemoUser();
  const outcome = await applyAttempt({
    userId: user.id,
    chapterId: input.chapterId,
    lemma: input.lemma,
    exerciseType: input.exerciseType,
    correct: input.correct,
    latencyMs: input.latencyMs,
  });

  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: { book: true },
  });
  if (chapter) revalidatePath(`/book/${chapter.book.slug}/${chapter.index}/prep`);
  revalidatePath("/review");

  return {
    mastery: outcome.mastery,
    prepScore: outcome.prepScore,
    unlocked: outcome.unlocked,
    coverageAfter: outcome.coverageAfter,
  };
}

/** 阅读中点词：返回释义，并把这个词标记为"不认识"（强信号）。 */
export async function lookupWord(input: { chapterId: string; lemma: string }) {
  const user = await getDemoUser();
  const entry = await lookupLemma(input.chapterId, input.lemma);
  if (!entry) return null;

  await prisma.userVocabState.upsert({
    where: { userId_lemma: { userId: user.id, lemma: input.lemma } },
    update: { status: "unknown", mastery: 0.15, source: "click", lastSeenAt: new Date() },
    create: {
      userId: user.id,
      lemma: input.lemma,
      status: "unknown",
      mastery: 0.15,
      source: "click",
    },
  });

  await prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId: user.id, chapterId: input.chapterId } },
    update: { lookupCount: { increment: 1 } },
    create: {
      userId: user.id,
      chapterId: input.chapterId,
      prepStatus: "in_progress",
      lookupCount: 1,
    },
  });

  return entry;
}

/** 保存阅读位置（句子下标）。 */
export async function savePosition(input: { chapterId: string; position: number }) {
  const user = await getDemoUser();
  await prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId: user.id, chapterId: input.chapterId } },
    update: { position: input.position },
    create: {
      userId: user.id,
      chapterId: input.chapterId,
      position: input.position,
      prepStatus: "in_progress",
    },
  });
}

/** 跳过预习直接读（记录事件，便于后续调阈值）。 */
export async function skipPrep(input: { chapterId: string; bookSlug: string; index: number }) {
  const user = await getDemoUser();
  await prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId: user.id, chapterId: input.chapterId } },
    update: { prepStatus: "skipped" },
    create: {
      userId: user.id,
      chapterId: input.chapterId,
      prepStatus: "skipped",
    },
  });
  revalidatePath(`/book/${input.bookSlug}`);
  redirect(`/book/${input.bookSlug}/${input.index}/read`);
}

/** 复习评分：更新卡片排期；忘了的词回退成 unknown。 */
export async function gradeCard(input: { lemma: string; grade: Grade }) {
  const user = await getDemoUser();
  const result = await applyGrade({ userId: user.id, lemma: input.lemma, grade: input.grade });
  if (!result) return null;
  revalidatePath("/review");
  return { intervalDays: result.intervalDays };
}

/** 把本章预习里"没掌握"的词加入复习队列。 */
export async function enqueueReview(chapterId: string) {
  const user = await getDemoUser();
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { vocab: true },
  });
  if (!chapter) return 0;
  const states = await getVocabStates(user.id);
  const weak = chapter.vocab.filter((v) => {
    const s = states.get(v.lemma);
    return (s?.mastery ?? 0.3) < PREP_LIMITS.minMastery;
  });
  for (const v of weak) {
    await prisma.reviewCard.upsert({
      where: { userId_lemma: { userId: user.id, lemma: v.lemma } },
      update: {},
      create: {
        userId: user.id,
        lemma: v.lemma,
        definitionZh: v.definitionZh,
        dueAt: new Date(),
      },
    });
  }
  revalidatePath("/review");
  return weak.length;
}
