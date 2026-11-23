import Link from "next/link";

import BookCover from "@/components/BookCover";
import { activeThresholds, getGate, GATE_LABEL } from "@/lib/gate";
import { coverUrl } from "@/lib/generated-art";
import { listLibrary, type BookCard } from "@/lib/services/library";
import { effectiveVocabSize, getDemoUser, getKnownSet } from "@/lib/services/user";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { cet4: "四级", cet6: "六级", toefl: "托福" };

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`.replace(/\.?0+%$/, "%");
}

function CoverageBar({ value, threshold }: { value: number; threshold: number }) {
  const tone = value >= threshold ? "" : value >= threshold - 0.01 ? "warn" : "danger";
  return (
    <div className={`meter ${tone}`}>
      <i style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

function BookTile({
  book,
  cover,
  threshold,
  challenge = false,
}: {
  book: BookCard;
  cover: string | null;
  threshold: number;
  challenge?: boolean;
}) {
  return (
    <Link href={`/book/${book.slug}`} className="card hover tile">
      <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" src={cover} />
      <div className="tile-body">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{book.title}</h3>
          <div className="muted tiny">{book.author}</div>
          <div className="tile-badges">
            <span className={`badge ${book.level === "cet4" ? "accent" : "warn"}`}>
              {LEVEL_LABEL[book.level] ?? "四级"}
            </span>
            {book.adaptedTier && <span className="badge accent">改写 · {LEVEL_LABEL[book.adaptedTier]}</span>}
            {challenge && <span className="badge warn">挑战</span>}
          </div>
        </div>

        <div className="kv" style={{ marginTop: 16 }}>
          <span>覆盖率</span>
          <b>{pct(book.personalCoverage)}</b>
        </div>
        <CoverageBar value={book.personalCoverage} threshold={threshold} />
        <div className="kv" style={{ marginTop: 10 }}>
          <span>生词</span>
          <b>{book.estUnknownWords}</b>
        </div>
        <div className="kv">
          <span>篇幅</span>
          <b>
            {book.wordCount.toLocaleString()} 词 · {book.chapterCount} 章
          </b>
        </div>
      </div>
    </Link>
  );
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level } = await searchParams;
  const levelFilter = level === "cet4" || level === "cet6" || level === "toefl" ? level : undefined;
  const user = await getDemoUser();
  const vocabSize = effectiveVocabSize(user);
  const known = await getKnownSet(user.id, vocabSize);
  const gate = getGate();
  const thresholds = activeThresholds(gate, user.level);
  const [readable, challenges] = await Promise.all([
    listLibrary(user.id, known, { admission: "pass", level: levelFilter }),
    listLibrary(user.id, known, { admission: "challenge", level: levelFilter }),
  ]);

  return (
    <main>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 30 }}>书库</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {user.level === "unknown" ? "未测评" : (LEVEL_LABEL[user.level] ?? "四级")} · {vocabSize} 词 ·{" "}
            <span className="badge">{GATE_LABEL[gate.active]}</span> {pct(thresholds.coverage)} /{" "}
            {thresholds.perSentence}
          </p>
        </div>
        <Link href="/level-test" className="btn">
          重新测评
        </Link>
      </div>

      <div className="chip-row" style={{ marginBottom: 20 }}>
        {[
          { key: "", label: "全部" },
          { key: "cet4", label: "四级" },
          { key: "cet6", label: "六级" },
          { key: "toefl", label: "托福" },
        ].map((item) => (
          <Link
            key={item.key || "all"}
            href={item.key ? `/library?level=${item.key}` : "/library"}
            className={`chip ${(levelFilter ?? "") === item.key ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section>
        <div className="section-head">
          <h2 style={{ fontSize: 20 }}>推荐阅读</h2>
          <span className="badge accent">{readable.length}</span>
        </div>
        {readable.length === 0 ? (
          <div className="empty">暂无书。</div>
        ) : (
          <div className="grid">
            {readable.map((book) => (
              <BookTile key={book.id} book={book} cover={coverUrl(book.slug)} threshold={thresholds.coverage} />
            ))}
          </div>
        )}
      </section>

      {challenges.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 style={{ fontSize: 20 }}>挑战区</h2>
            <span className="badge warn">{challenges.length}</span>
          </div>
          <div className="grid">
            {challenges.map((book) => (
              <BookTile
                key={book.id}
                book={book}
                cover={coverUrl(book.slug)}
                threshold={thresholds.coverage}
                challenge
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
