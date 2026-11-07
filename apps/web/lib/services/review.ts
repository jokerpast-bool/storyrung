import { prisma } from "@/lib/db";
import { dueDate, schedule, type Grade } from "@/lib/domain/srs";

/**
 * 复习评分落库：更新卡片排期 + 回写词汇掌握度。
 * 与 actions.gradeCard 分离，方便脚本/测试直接验证闭环。
 */
export async function applyGrade(input: {
  userId: string;
  lemma: string;
  grade: Grade;
}): Promise<{ intervalDays: number; dueAt: Date; nextEase: number } | null> {
  const card = await prisma.reviewCard.findUnique({
    where: { userId_lemma: { userId: input.userId, lemma: input.lemma } },
  });
  if (!card) return null;

  const currentInterval = Math.max(
    1,
    Math.round((card.dueAt.getTime() - Date.now()) / 86_400_000),
  );
  const next = schedule(
    {
      intervalDays: currentInterval,
      ease: card.stability > 0 ? Math.min(3.2, Math.max(1.3, card.stability)) : 2.5,
      lapses: card.lapses,
      reps: card.reps,
    },
    input.grade,
  );
  const dueAt = dueDate(new Date(), next.intervalDays);

  await prisma.reviewCard.update({
    where: { id: card.id },
    data: {
      dueAt,
      lapses: next.lapses,
      reps: next.reps,
      lastReviewAt: new Date(),
      stability: next.intervalDays,
      difficulty: Math.max(0, Math.min(1, 1 - (next.ease - 1.3) / 1.9)),
    },
  });

  await prisma.userVocabState.updateMany({
    where: { userId: input.userId, lemma: input.lemma },
    data: {
      status: input.grade === 0 ? "unknown" : "learning",
      mastery: input.grade === 0 ? 0.2 : Math.min(1, 0.6 + input.grade * 0.13),
      source: "review",
      lastSeenAt: new Date(),
    },
  });

  return { intervalDays: next.intervalDays, dueAt, nextEase: next.ease };
}
