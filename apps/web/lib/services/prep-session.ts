import { prisma } from "@/lib/db";
import { coverage } from "@/lib/domain/coverage";
import {
  PREP_LIMITS,
  coreGateLemmas,
  coreMasteryScore,
  nextMastery,
} from "@/lib/domain/prep";
import type { Band } from "@/lib/domain/types";
import { getKnownSet, getVocabStates } from "./user";

export interface AttemptOutcome {
  mastery: number;
  prepScore: number;
  unlocked: boolean;
  coverageAfter: number;
  enqueued: number;
}

/**
 * 预习作答的完整落库流程（不碰 Next 的 revalidate，方便脚本/测试直接调用）。
 * 步骤：掌握度更新 → attempt 记录 → 重算通关分 → 通关则把弱词放进复习队列。
 */
export async function applyAttempt(input: {
  userId: string;
  chapterId: string;
  lemma: string;
  exerciseType: "recognize" | "cloze" | "spell";
  correct: boolean;
  latencyMs: number;
}): Promise<AttemptOutcome> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    include: { vocab: true, book: true },
  });
  if (!chapter) throw new Error("chapter not found");

  const existing = await prisma.userVocabState.findUnique({
    where: { userId_lemma: { userId: input.userId, lemma: input.lemma } },
  });
  const mastery = nextMastery(existing?.mastery ?? 0.3, input.correct, input.latencyMs);
  const status = mastery >= 0.75 ? "learning" : input.correct ? "learning" : "unknown";

  await prisma.userVocabState.upsert({
    where: { userId_lemma: { userId: input.userId, lemma: input.lemma } },
    update: { mastery, status, source: "exercise", lastSeenAt: new Date() },
    create: {
      userId: input.userId,
      lemma: input.lemma,
      mastery,
      status,
      source: "exercise",
    },
  });

  await prisma.attempt.create({
    data: {
      userId: input.userId,
      chapterId: chapter.id,
      lemma: input.lemma,
      exerciseType: input.exerciseType,
      correct: input.correct,
      latencyMs: input.latencyMs,
    },
  });

  const states = await getVocabStates(input.userId);
  const core = coreGateLemmas(
    chapter.vocab.map((v) => ({
      lemma: v.lemma,
      kind: v.kind as "word" | "phrase",
      surfaceForms: [],
      pos: v.pos,
      phonetic: v.phonetic,
      definitionZh: v.definitionZh,
      freqRank: v.freqRank,
      band: v.band as Band,
      importance: v.importance,
      occurrenceCount: v.occurrenceCount,
    })),
  );
  const prepScore = coreMasteryScore(core, (lemma) => states.get(lemma)?.mastery);

  const counts = JSON.parse(chapter.lemmaCounts || "{}") as Record<string, number>;
  // 覆盖率要基于"基线词汇量 + 本会话学到的词"，不能只看本次作答产生的状态
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  const vocabSize = user?.vocabSize && user.vocabSize > 0 ? user.vocabSize : user?.level === "cet6" ? 6000 : 4500;
  const known = await getKnownSet(input.userId, vocabSize);
  for (const state of states.values()) {
    if (state.mastery >= 0.7) known.add(state.lemma);
  }
  const coverageAfter = coverage(counts, known);

  // 通关只要求核心词掌握度达标；覆盖率是难度参考，不用来卡住用户
  const unlocked = prepScore >= PREP_LIMITS.minMastery;

  let enqueued = 0;
  if (unlocked) {
    for (const lemma of core) {
      if ((states.get(lemma)?.mastery ?? 0.3) >= PREP_LIMITS.minMastery) continue;
      const vocabRow = chapter.vocab.find((v) => v.lemma === lemma);
      await prisma.reviewCard.upsert({
        where: { userId_lemma: { userId: input.userId, lemma } },
        update: {},
        create: {
          userId: input.userId,
          lemma,
          definitionZh: vocabRow?.definitionZh ?? "",
          dueAt: new Date(),
        },
      });
      enqueued += 1;
    }
  }

  await prisma.chapterProgress.upsert({
    where: { userId_chapterId: { userId: input.userId, chapterId: chapter.id } },
    update: { prepScore, prepStatus: unlocked ? "passed" : "in_progress" },
    create: {
      userId: input.userId,
      chapterId: chapter.id,
      prepScore,
      prepStatus: unlocked ? "passed" : "in_progress",
    },
  });

  return { mastery, prepScore, unlocked, coverageAfter, enqueued };
}
