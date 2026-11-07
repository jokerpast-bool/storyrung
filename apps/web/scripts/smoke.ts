/**
 * 链路自检：走一遍"预习作答 → 掌握度 → 通关 → 复习队列 → 复习评分"，
 * 不经过 Next 的请求上下文（因此可直接用 tsx 跑），验证的是服务层真实写库行为。
 *
 * 用法：node ../../node_modules/tsx/dist/cli.mjs scripts/smoke.ts
 */
import { prisma } from "../lib/db";
import { PREP_LIMITS } from "../lib/domain/prep";
import { applyAttempt } from "../lib/services/prep-session";
import { applyGrade } from "../lib/services/review";
import { getDemoUser, getKnownSet, getVocabStates } from "../lib/services/user";

async function main() {
  const user = await getDemoUser();
  console.log(`· 用户 ${user.name}（level=${user.level}, vocab=${user.vocabSize}）`);

  // 自检要跑"第一次学"的路径，先清掉 demo 用户的历史状态（只影响 demo 用户）
  await prisma.attempt.deleteMany({ where: { userId: user.id } });
  await prisma.userVocabState.deleteMany({ where: { userId: user.id } });
  await prisma.chapterProgress.deleteMany({ where: { userId: user.id } });
  await prisma.reviewCard.deleteMany({ where: { userId: user.id } });
  console.log("· 已重置 demo 用户状态");

  const book = await prisma.book.findFirst({ where: { admission: "pass" }, orderBy: { wordCount: "asc" } });
  if (!book) throw new Error("没有通过准入闸的书，先跑内容管线与 seed");
  const chapter = await prisma.chapter.findFirst({
    where: { bookId: book.id },
    orderBy: { index: "asc" },
    include: { vocab: true },
  });
  if (!chapter) throw new Error("书里没有章节");

  console.log(`· 目标章节《${book.title}》第 ${chapter.index} 章（${chapter.wordCount} 词 / ${chapter.vocab.length} 条词表）`);

  // 核心词：按重要度取前 12 个（与页面上的通关集合一致）
  const core = [...chapter.vocab]
    .filter((v) => v.kind === "word" && v.definitionZh.trim().length > 0)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, PREP_LIMITS.words);

  // 第一个词先答错再答对：模拟"练过但没掌握牢"，这样才能验证复习队列真的会入队
  console.log(`· 第 1 个词先答错再答对，其余 ${core.length - 1} 个直接答对 …`);
  const wrong = await applyAttempt({
    userId: user.id,
    chapterId: chapter.id,
    lemma: core[0].lemma,
    exerciseType: "recognize",
    correct: false,
    latencyMs: 4200,
  });
  console.log(`  ${core[0].lemma.padEnd(14)} 答错 → mastery=${wrong.mastery.toFixed(2)}`);

  let outcome = wrong;
  for (const [index, word] of core.entries()) {
    outcome = await applyAttempt({
      userId: user.id,
      chapterId: chapter.id,
      lemma: word.lemma,
      exerciseType: "recognize",
      correct: true,
      latencyMs: 2500 + index * 100,
    });
    if (index === 0 || index === core.length - 1) {
      console.log(
        `  ${String(index + 1).padStart(2)}. ${word.lemma.padEnd(14)} mastery=${outcome.mastery.toFixed(2)} ` +
          `prepScore=${outcome.prepScore.toFixed(2)} unlocked=${outcome.unlocked} enqueued=${outcome.enqueued}`,
      );
    }
  }

  const progress = await prisma.chapterProgress.findUnique({
    where: { userId_chapterId: { userId: user.id, chapterId: chapter.id } },
  });
  const cards = await prisma.reviewCard.findMany({ where: { userId: user.id } });
  const states = await getVocabStates(user.id);
  const known = await getKnownSet(user.id, user.vocabSize > 0 ? user.vocabSize : 4500);

  console.log("· 预习结果");
  console.log(`  prepStatus = ${progress?.prepStatus} · prepScore = ${progress?.prepScore.toFixed(2)}`);
  console.log(`  复习卡片 ${cards.length} 张 · 词汇状态 ${states.size} 条 · 已知词 ${known.size} 个`);
  console.log(`  coverageAfter = ${outcome.coverageAfter.toFixed(3)}`);

  if (cards.length === 0) throw new Error("通关后应该有弱词进入复习队列，实际为 0");
  const card = cards[0];
  const beforeDue = card.dueAt.toISOString();
  const graded = await applyGrade({ userId: user.id, lemma: card.lemma, grade: 2 });
  const after = await prisma.reviewCard.findUnique({ where: { id: card.id } });
  console.log("· 复习评分");
  console.log(
    `  ${card.lemma.padEnd(14)} 记得(good) → 间隔 ${graded?.intervalDays} 天，dueAt ${beforeDue.slice(0, 10)} → ${graded?.dueAt.toISOString().slice(0, 10)}`,
  );
  console.log(`  reps ${card.reps} → ${after?.reps} · lapses ${card.lapses} → ${after?.lapses}`);

  const unlockedOk = progress?.prepStatus === "passed" && outcome.prepScore >= PREP_LIMITS.minMastery;
  const queueOk = cards.length >= 1;
  const gradeOk = (graded?.intervalDays ?? 0) >= 2 && (after?.reps ?? 0) > card.reps;
  console.log(
    `${unlockedOk ? "✔" : "✘"} 预习通关   ${queueOk ? "✔" : "✘"} 入复习队列   ${gradeOk ? "✔" : "✘"} 复习评分与排期`,
  );
  if (!unlockedOk || !queueOk || !gradeOk) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
