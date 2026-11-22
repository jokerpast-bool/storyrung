import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles, BookOpen, Layers3, Repeat2, Mail } from "lucide-react";

import HeroArt from "@/components/HeroArt";
import ShelfCarousel from "@/components/ShelfCarousel";
import BookCover from "@/components/BookCover";
import { prisma } from "@/lib/db";
import { coverUrl } from "@/lib/generated-art";
import { displayAuthor } from "@/lib/visual-brief";
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
  const shelf = [...readable, ...challenges];
  const challengeIds = new Set(challenges.map((book) => book.id));
  const bookCount = shelf.length;
  const hasLevel = user.level !== "unknown";

  // 首页展示用的书封：优先推荐位，往后填满；不足时补挑战位
  const displayBooks = [...readable, ...challenges];

  return (
    <main className="lp">
      {/* ===== Hero ===== */}
      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden>
          {displayBooks.slice(0, 4).map((book, i) => {
            const src = coverUrl(book.slug);
            return src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={book.slug} src={src} alt="" className={`lp-hero-cover lp-hero-cover-${i}`} />
            ) : null;
          })}
          <div className="lp-hero-leaf lp-hero-leaf-a" />
          <div className="lp-hero-leaf lp-hero-leaf-b" />
        </div>
        <div className="lp-hero-inner">
          <h1 className="lp-wordmark">
            story<span>rung</span>
          </h1>
          <div className="lp-hero-actions">
            <Link href={hasLevel ? "/library" : "/level-test"} className="lp-btn lp-btn-light">
              {hasLevel ? "进入书库" : "测词汇量"} <ArrowRight size={16} />
            </Link>
            <Link href="/library" className="lp-btn lp-btn-ghost">
              先看书库 <ArrowUpRight size={15} />
            </Link>
          </div>

          <div className="lp-hero-cards">
            <div className="lp-hero-card lp-hero-card-dark">
              <span className="lp-hero-card-label">你的水平</span>
              <strong>{hasLevel ? `${LEVEL_LABEL[user.level] ?? user.level}` : "待测"}</strong>
              <span className="lp-hero-card-sub">
                {hasLevel ? `${user.vocabSize.toLocaleString()} 词` : "2 分钟测评"}
              </span>
            </div>
            <div className="lp-hero-card lp-hero-card-light">
              <span className="lp-hero-card-label">可读书目</span>
              <strong>{bookCount} 本</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 三个卖点卡：只留标题 ===== */}
      <section className="lp-strip">
        <div className="lp-feature-row">
          <article className="lp-feature">
            <span className="lp-feature-ico"><Sparkles size={18} /></span>
            <h3>先练后读</h3>
          </article>
          <article className="lp-feature">
            <span className="lp-feature-ico"><Layers3 size={18} /></span>
            <h3>按词汇量分级</h3>
          </article>
          <article className="lp-feature">
            <span className="lp-feature-ico"><Repeat2 size={18} /></span>
            <h3>读完就复习</h3>
          </article>
        </div>
      </section>

      {/* ===== 三张大分类卡（Pet Friendly / Orchids / Succulents 的位置） ===== */}
      <section className="lp-cats">
        <Link href="/library" className="lp-cat lp-cat-a">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {coverUrl("the-wonderful-wizard-of-oz") && (
            <img src={coverUrl("the-wonderful-wizard-of-oz")!} alt="" />
          )}
          <div className="lp-cat-body">
            <h3>四级书库</h3>
            <span className="lp-cat-link">去看看 <ArrowUpRight size={14} /></span>
          </div>
        </Link>
        <Link href="/library" className="lp-cat lp-cat-b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {coverUrl("daisy-miller") && <img src={coverUrl("daisy-miller")!} alt="" />}
          <div className="lp-cat-body">
            <h3>六级精选</h3>
            <span className="lp-cat-link">去看看 <ArrowUpRight size={14} /></span>
          </div>
        </Link>
        <Link href="/library" className="lp-cat lp-cat-c">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {coverUrl("the-call-of-the-wild") && <img src={coverUrl("the-call-of-the-wild")!} alt="" />}
          <div className="lp-cat-body">
            <h3>挑战区</h3>
            <span className="lp-cat-link">去看看 <ArrowUpRight size={14} /></span>
          </div>
        </Link>
      </section>

      {/* ===== 圆形封面卡片列表（New Plants 的位置） ===== */}
      <section className="lp-new">
        <div className="lp-section-head lp-new-head">
          <div>
            <h2 className="lp-h2">最近上新</h2>
          </div>
          <Link href="/library" className="lp-viewall">查看全部 <ArrowUpRight size={14} /></Link>
        </div>
        <div className="lp-round-grid">
          {displayBooks.slice(0, 3).map((book) => {
            const src = coverUrl(book.slug);
            return (
              <Link href={`/book/${book.slug}`} key={book.id} className="lp-round-card">
                <div className="lp-round-img">
                  <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" src={src} />
                </div>
                <h3>{book.title}</h3>
                <p className="lp-round-author">{displayAuthor(book.author)}</p>
                <p className="lp-round-meta">{book.chapterCount} 章 · {book.adaptedTier ? LEVEL_LABEL[book.adaptedTier] ?? "改写" : LEVEL_LABEL[book.level] ?? book.level}</p>
                <span className="lp-round-go"><ArrowUpRight size={15} /></span>
              </Link>
            );
          })}
        </div>
        <div className="lp-dots" aria-hidden>
          <span className="on" /><span /><span />
        </div>
      </section>

      {/* ===== 大标题 + 网格（Indoor Collection 的位置） ===== */}
      <section className="lp-collection">
        <div className="lp-collection-head">
          <h2 className="lp-collection-title">Indoor <em>Collection</em></h2>
        </div>
        <div className="lp-collage">
          {displayBooks.slice(3, 7).map((book) => {
            const src = coverUrl(book.slug);
            return (
              <Link href={`/book/${book.slug}`} key={book.id} className="lp-book">
                <span className="lp-book-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src ? <img src={src} alt="" /> : <span className="lp-book-fallback">{book.title.slice(0, 1)}</span>}
                </span>
                <span className="lp-book-title">{book.title}</span>
                <span className="lp-book-author">{displayAuthor(book.author)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ===== 保留：我的书架轮播（用户已有的组件） ===== */}
      {shelf.length > 0 && (
        <section className="shelf shelf-panel lp-my-shelf">
          <div className="shelf-head">
            <span className="shelf-label">继续我的书架</span>
            <Link href="/library" className="shelf-more">全部 {bookCount} 本 →</Link>
          </div>
          <ShelfCarousel
            books={shelf.map((book) => ({
              id: book.id,
              slug: book.slug,
              title: book.title,
              author: displayAuthor(book.author),
              level: book.level,
              adaptedTier: book.adaptedTier,
              coverEmoji: book.coverEmoji,
              cover: coverUrl(book.slug),
              chapterCount: book.chapterCount,
              challenge: challengeIds.has(book.id),
            }))}
          />
        </section>
      )}

      {/* ===== 统计条 ===== */}
      <div className="stat-strip">
        <div><div className="stat-value">{bookCount}</div><div className="muted tiny">可读书目</div></div>
        <div><div className="stat-value">{dueCards}</div><div className="muted tiny">待复习</div></div>
        <div><div className="stat-value">{vocabCount}</div><div className="muted tiny">生词记录</div></div>
        <div><div className="stat-value">{finished}</div><div className="muted tiny">读完章节</div></div>
      </div>

      {/* ===== 大幅引导区（只保留画面） ===== */}
      <section className="lp-feature-banner">
        <div className="lp-video">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {coverUrl("the-princess-and-the-goblin") && (
            <img src={coverUrl("the-princess-and-the-goblin")!} alt="" />
          )}
        </div>
      </section>

      {/* ===== 底部 CTA ===== */}
      <section className="lp-community">
        <div className="lp-community-inner">
          <span className="lp-community-mark"><BookOpen size={22} /></span>
          <div className="lp-community-actions">
            <Link href="/level-test" className="lp-btn lp-btn-light">测我的词汇量 <ArrowRight size={15} /></Link>
            <Link href="/library" className="lp-btn lp-btn-ghost">逛书库 <ArrowUpRight size={14} /></Link>
          </div>
          <div className="lp-community-social" aria-label="站点导航">
            <Link href="/library">书库</Link>
            <Link href="/vocab">生词本</Link>
            <Link href="/review">复习</Link>
            <Link href="/level-test">测评</Link>
          </div>
        </div>
      </section>

      {/* ===== 底部 newsletter（参考图最底） ===== */}
      <div className="lp-newsletter">
        <Mail size={16} /> <span>storyrung · Read your way up.</span>
      </div>
    </main>
  );
}
