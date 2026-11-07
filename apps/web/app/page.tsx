import Link from "next/link";
import { ArrowRight } from "lucide-react";

import BookCover from "@/components/BookCover";
import { prisma } from "@/lib/db";
import { listLibrary } from "@/lib/services/library";
import { effectiveVocabSize, getDemoUser, getKnownSet } from "@/lib/services/user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getDemoUser();
  const known = await getKnownSet(user.id, effectiveVocabSize(user));
  const [readable, challenges, dueCards, vocabCount, finished] = await Promise.all([
    listLibrary(user.id, known, { admission: "pass" }),
    listLibrary(user.id, known, { admission: "challenge" }),
    prisma.reviewCard.count({ where: { userId: user.id, dueAt: { lte: new Date() } } }),
    prisma.userVocabState.count({ where: { userId: user.id } }),
    prisma.chapterProgress.count({ where: { userId: user.id, completedAt: { not: null } } }),
  ]);
  const shelf = [...readable, ...challenges].slice(0, 3);
  const hasLevel = user.level !== "unknown";

  return (
    <main>
      <section className="hero-panel">
        <h1>
          先练生词，
          <br />
          再读原著
        </h1>
        <p className="lead" style={{ marginBottom: 22 }}>
          按词汇量分级推荐公版英文书，每章先练该章生词，达标再读。
        </p>

        <div className="row">
          {hasLevel ? (
            <>
              <Link href="/library" className="btn primary">
                进入书库 <ArrowRight size={15} />
              </Link>
              <span className="muted small">
                {user.level === "cet6" ? "六级" : "四级"} · {user.vocabSize} 词
              </span>
            </>
          ) : (
            <>
              <Link href="/level-test" className="btn primary">
                测词汇量 <ArrowRight size={15} />
              </Link>
              <Link href="/library" className="btn ghost">
                先看书库
              </Link>
            </>
          )}
        </div>

        {shelf.length > 0 && (
          <div className="hero-books">
            {shelf.map((book) => (
              <Link key={book.id} href={`/book/${book.slug}`} title={book.title}>
                <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="stat-strip">
        <div>
          <div className="stat-value">{readable.length + challenges.length}</div>
          <div className="muted tiny">可读书目</div>
        </div>
        <div>
          <div className="stat-value">{dueCards}</div>
          <div className="muted tiny">待复习</div>
        </div>
        <div>
          <div className="stat-value">{vocabCount}</div>
          <div className="muted tiny">生词记录</div>
        </div>
        <div>
          <div className="stat-value">{finished}</div>
          <div className="muted tiny">读完章节</div>
        </div>
      </div>

      <section className="grid" style={{ marginTop: 26 }}>
        <div className="card">
          <h3>测词汇量</h3>
          <p className="muted small" style={{ margin: 0 }}>
            24 题看词选义，定四级/六级。
          </p>
        </div>
        <div className="card">
          <h3>按可读性选书</h3>
          <p className="muted small" style={{ margin: 0 }}>
            覆盖率达标才进书库，不达标进改写队列。
          </p>
        </div>
        <div className="card">
          <h3>先练后读</h3>
          <p className="muted small" style={{ margin: 0 }}>
            每章 ≤12 词、≤4 短语、≤3 长难句。
          </p>
        </div>
      </section>
    </main>
  );
}
