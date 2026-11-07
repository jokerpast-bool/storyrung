import Link from "next/link";

import ReviewTrainer from "@/components/review/ReviewTrainer";
import { prisma } from "@/lib/db";
import { getDemoUser } from "@/lib/services/user";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await getDemoUser();
  const [due, total] = await Promise.all([
    prisma.reviewCard.findMany({
      where: { userId: user.id, dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: 30,
    }),
    prisma.reviewCard.count({ where: { userId: user.id } }),
  ]);

  const stats = await prisma.attempt.groupBy({
    by: ["correct"],
    where: { userId: user.id },
    _count: { _all: true },
  });
  const correctCount = stats.find((s) => s.correct)?._count._all ?? 0;
  const wrongCount = stats.find((s) => !s.correct)?._count._all ?? 0;
  const accuracy = correctCount + wrongCount > 0 ? correctCount / (correctCount + wrongCount) : 0;

  return (
    <main>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 30 }}>复习</h1>
          <p className="muted small" style={{ margin: 0 }}>
            到期卡片 {due.length} 张 · 队列共 {total} 张 · 历史正确率 {(accuracy * 100).toFixed(0)}%
          </p>
        </div>
        <Link href="/library" className="btn">
          回书库
        </Link>
      </div>

      {due.length === 0 ? (
        <div className="empty">今天没有到期卡片。</div>
      ) : (
        <ReviewTrainer
          cards={due.map((c) => ({
            lemma: c.lemma,
            definitionZh: c.definitionZh,
            reps: c.reps,
          }))}
        />
      )}
    </main>
  );
}
