import Link from "next/link";
import { ArrowRight } from "lucide-react";

import BookCover from "@/components/BookCover";
import HeroArt from "@/components/HeroArt";
import { prisma } from "@/lib/db";
import { coverUrl } from "@/lib/generated-art";
import { listLibrary, getContinueReading } from "@/lib/services/library";
import { effectiveVocabSize, getDemoUser, getKnownSet } from "@/lib/services/user";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { cet4: "四级", cet6: "六级", toefl: "托福" };

export default async function HomePage() {
  const user = await getDemoUser();
  const known = await getKnownSet(user.id, effectiveVocabSize(user));
  const [readable, challenges, dueCards, vocabCount, finished, resume] = await Promise.all([
    listLibrary(user.id, known, { admission: "pass" }),
    listLibrary(user.id, known, { admission: "challenge" }),
    prisma.reviewCard.count({ where: { userId: user.id, dueAt: { lte: new Date() } } }),
    prisma.userVocabState.count({ where: { userId: user.id } }),
    prisma.chapterProgress.count({ where: { userId: user.id, completedAt: { not: null } } }),
    getContinueReading(user.id),
  ]);
  const shelf = [...readable, ...challenges].slice(0, 3);
  const bookCount = readable.length + challenges.length;
  const hasLevel = user.level !== "unknown";

  return (
    <main>
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1 className="home-wordmark">
            story<span>rung</span>
          </h1>
          <div className="home-rule" aria-hidden />
          <p className="home-tagline">Read your way up.</p>
          <p className="home-status">
            {hasLevel ? `${LEVEL_LABEL[user.level] ?? user.level} · ${user.vocabSize.toLocaleString()} 词` : "还没测过词汇量"}
          </p>
          <div className="home-actions">
            {hasLevel ? (
              <Link href="/library" className="btn primary">
                进入书库 <ArrowRight size={15} />
              </Link>
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

          {resume && (
            <Link
              href={resume.atEnd ? `/book/${resume.bookSlug}` : `/book/${resume.bookSlug}/${resume.chapterIndex}/read`}
              className="home-resume"
            >
              <span className="home-resume-label">
                {resume.atEnd ? "已读完" : resume.finished ? "读下一章" : "接着读"}
              </span>
              <span className="home-resume-title">{resume.bookTitle}</span>
              <span className="home-resume-meta">
                {resume.atEnd ? "全书读完" : `第 ${resume.chapterIndex} 章`}
                {!resume.atEnd && !resume.finished ? ` · ${resume.percent}%` : ""}
              </span>
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
        <div className="home-art">
          <HeroArt />
        </div>
      </section>

      {shelf.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <span className="shelf-label">书架</span>
            <Link href="/library" className="shelf-more">
              全部 {bookCount} 本 →
            </Link>
          </div>
          <div className="shelf-grid">
            {shelf.map((book) => {
              const tier = book.adaptedTier ? "改写" : LEVEL_LABEL[book.level] ?? "";
              return (
                <Link key={book.id} href={`/book/${book.slug}`} className="shelf-card" title={book.title}>
                  <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" src={coverUrl(book.slug)} />
                  <div className="shelf-meta">
                    <div className="shelf-title">{book.title}</div>
                    <div className="shelf-author">{book.author}</div>
                    <div className="shelf-foot">
                      <span>{tier}</span>
                      <span>{book.chapterCount} 章</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="stat-strip">
        <div>
          <div className="stat-value">{bookCount}</div>
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
    </main>
  );
}
