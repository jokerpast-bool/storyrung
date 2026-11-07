import Link from "next/link";

import { prisma } from "@/lib/db";
import { getDemoUser } from "@/lib/services/user";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  unknown: { label: "不认识", tone: "danger" },
  uncertain: { label: "不确定", tone: "warn" },
  learning: { label: "在学", tone: "warn" },
  known: { label: "已掌握", tone: "accent" },
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "unknown", label: "不认识" },
  { key: "learning", label: "在学" },
  { key: "known", label: "已掌握" },
];

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const user = await getDemoUser();

  const [rows, grouped] = await Promise.all([
    prisma.userVocabState.findMany({
      where: { userId: user.id, ...(filter === "all" ? {} : { status: filter }) },
      orderBy: [{ mastery: "asc" }, { lastSeenAt: "desc" }],
      take: 200,
    }),
    prisma.userVocabState.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
  ]);

  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
  const total = grouped.reduce((acc, row) => acc + row._count._all, 0);

  const definitions = rows.length
    ? await prisma.lemmaIndex.findMany({
        where: { lemma: { in: rows.map((row) => row.lemma) } },
        select: { lemma: true, definitionZh: true, phonetic: true, band: true },
      })
    : [];
  const byLemma = new Map(definitions.map((row) => [row.lemma, row]));

  return (
    <main>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 30 }}>生词本</h1>
          <p className="muted small" style={{ margin: 0 }}>
            共 {total} 条 · 来自测评、预习和阅读中点词
          </p>
        </div>
        <Link href="/review" className="btn">
          去复习
        </Link>
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "all" ? "/vocab" : `/vocab?filter=${item.key}`}
            className={`chip ${filter === item.key ? "active" : ""}`}
          >
            {item.label}
            {item.key !== "all" && counts.get(item.key) ? ` ${counts.get(item.key)}` : ""}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">还没有生词记录。测一次词汇量或读一章就会有了。</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>单词</th>
                <th>释义</th>
                <th style={{ width: 90 }}>状态</th>
                <th style={{ width: 80 }}>掌握度</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = byLemma.get(row.lemma);
                const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.uncertain;
                return (
                  <tr key={row.id}>
                    <td>
                      <b>{row.lemma}</b>
                      <div className="muted tiny">{meta?.phonetic ?? ""}</div>
                    </td>
                    <td className="small">{meta?.definitionZh ?? "—"}</td>
                    <td>
                      <span className={`badge ${status.tone}`}>{status.label}</span>
                    </td>
                    <td className="muted">{row.mastery.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
