import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";

import BookCover from "@/components/BookCover";
import { activeThresholds, getGate } from "@/lib/gate";
import { coverUrl } from "@/lib/generated-art";
import { getBookDetail } from "@/lib/services/library";
import { effectiveVocabSize, getDemoUser, getKnownSet } from "@/lib/services/user";

export const dynamic = "force-dynamic";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

const PREP_LABEL: Record<string, string> = {
  locked: "未开始",
  in_progress: "预习中",
  passed: "已通关",
  skipped: "已跳过",
};

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getDemoUser();
  const known = await getKnownSet(user.id, effectiveVocabSize(user));
  const book = await getBookDetail(slug, user.id, known);
  if (!book) notFound();

  const gate = getGate();
  const thresholds = activeThresholds(gate, book.level);

  return (
    <main>
      <div className="row" style={{ marginBottom: 6 }}>
        <Link href="/library" className="btn ghost">
          ← 书库
        </Link>
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: 18 }}>
        <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" src={coverUrl(book.slug)} />
        <div>
          <h1 style={{ fontSize: 32, marginBottom: 6 }}>{book.title}</h1>
          <div className="row">
            <span className="muted">{book.author}</span>
            <span className={`badge ${book.level === "cet4" ? "accent" : "warn"}`}>
              {book.level === "cet4" ? "四级" : book.level === "cet6" ? "六级" : "托福"}
            </span>
            {book.adaptedTier && (
              <span className="badge accent">
                改写版 · {book.adaptedTier === "cet4" ? "四级" : book.adaptedTier === "cet6" ? "六级" : "托福"}
              </span>
            )}
            <span className={`badge ${book.admission === "challenge" ? "warn" : "accent"}`}>
              {book.admission === "challenge" ? "挑战区" : "推荐"}
            </span>
            <span className="badge">{book.license === "public-domain" ? "公版" : book.license}</span>
            <span className="badge">
              {book.wordCount.toLocaleString()} 词 / {book.chapterCount} 章
            </span>
          </div>
        </div>
      </div>

      <div className="card flat" style={{ marginTop: 18, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div>
          <div className="kv">
            <span>你的覆盖率</span>
            <b>{pct(book.personalCoverage)}</b>
          </div>
          <div className="kv">
            <span>生词</span>
            <b>{book.estUnknownWords}</b>
          </div>
        </div>
        <div>
          <div className="kv">
            <span>基准覆盖率</span>
            <b>{pct(book.gateCoverage)}</b>
          </div>
          <div className="kv">
            <span>句均生词</span>
            <b>{book.gateUnknownPerSentence.toFixed(2)}</b>
          </div>
        </div>
        <div>
          <div className="kv">
            <span>准入</span>
            <b>
              {pct(thresholds.coverage)} / {thresholds.perSentence}
            </b>
          </div>
          <div className="kv">
            <span>来源</span>
            <b>Gutenberg #{book.sourceUrl.split("/").pop()}</b>
          </div>
        </div>
      </div>

      {book.admission !== "fail" && (() => {
        const nextChapter =
          book.chapters.find((chapter) => chapter.position > 0 && !chapter.completed) ??
          book.chapters.find((chapter) => !chapter.completed);
        if (!nextChapter) return null;
        return (
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn primary" href={`/book/${book.slug}/${nextChapter.index}/read`}>
              {nextChapter.position > 0 ? "继续读" : "开始读"} · 第 {nextChapter.index} 章
              <ArrowRight size={15} />
            </Link>
            {nextChapter.position > 0 && (
              <span className="muted tiny">上次读到第 {nextChapter.position + 1} 句</span>
            )}
          </div>
        );
      })()}

      <section className="section">
        <div className="section-head">
          <h2 style={{ fontSize: 20 }}>章节目录</h2>
        </div>

        {book.admission === "fail" ? (
          <div className="note danger">
            正文暂未上架。
            <div style={{ marginTop: 8 }}>
              <Link href="/library" className="btn">
                回书库
              </Link>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>章节</th>
                <th style={{ width: 110 }}>你的覆盖率</th>
                <th style={{ width: 90 }}>生词</th>
                <th style={{ width: 90 }}>长难句</th>
                <th style={{ width: 90 }}>预计</th>
                <th style={{ width: 96 }}>预习</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {book.chapters.map((chapter) => {
                const passed = chapter.prepStatus === "passed" || chapter.prepStatus === "skipped";
                return (
                  <tr key={chapter.id}>
                    <td className="muted">{chapter.index}</td>
                    <td>
                      <b>{chapter.title}</b>
                      <div className="muted tiny">{chapter.wordCount} 词</div>
                    </td>
                    <td>{pct(chapter.coverage)}</td>
                    <td>{chapter.unknownWords}</td>
                    <td>{chapter.hardSentences}</td>
                    <td className="muted">{chapter.estMinutes} 分钟</td>
                    <td>
                      <span className={`badge ${passed ? "accent" : ""}`}>
                        {PREP_LABEL[chapter.prepStatus] ?? chapter.prepStatus}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <Link
                          className="btn"
                          style={{ padding: "5px 10px", fontSize: 13 }}
                          href={`/book/${book.slug}/${chapter.index}/prep`}
                        >
                          预习
                        </Link>
                        <Link
                          className={`btn ${passed ? "primary" : ""}`}
                          style={{ padding: "5px 10px", fontSize: 13 }}
                          href={`/book/${book.slug}/${chapter.index}/read`}
                        >
                          {chapter.position > 0 ? "继续读" : "阅读"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </main>
  );
}
