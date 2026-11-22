"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import BookCover from "@/components/BookCover";

export interface ShelfBook {
  id: string;
  slug: string;
  title: string;
  author: string;
  level: string;
  adaptedTier: string;
  coverEmoji: string;
  cover: string | null;
  chapterCount: number;
  challenge?: boolean;
}

const LEVEL_LABEL: Record<string, string> = { cet4: "四级", cet6: "六级", toefl: "托福" };

export default function ShelfCarousel({ books }: { books: ShelfBook[] }) {
  const [active, setActive] = useState(0);
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ acc: 0, last: 0 });
  const count = books.length;

  const move = useCallback(
    (step: number) => {
      setActive((current) => (current + step + count) % count);
    },
    [count],
  );

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const delta = event.deltaY * scale;
      const state = wheelRef.current;
      if (state.acc !== 0 && Math.sign(delta) !== Math.sign(state.acc)) state.acc = 0;
      state.acc += delta;
      const now = Date.now();
      if (Math.abs(state.acc) < 30 || now - state.last < 220) return;
      state.last = now;
      state.acc = 0;
      move(delta > 0 ? 1 : -1);
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [move]);

  if (count === 0) return null;

  return (
    <div className="shelf-carousel-wrap">
      <div
        ref={stageRef}
        className="shelf-carousel"
        role="listbox"
        aria-label="书架"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") move(-1);
          if (event.key === "ArrowRight") move(1);
        }}
      >
        {books.map((book, index) => {
          let offset = index - active;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;

          const abs = Math.abs(offset);
          const isActive = offset === 0;
          const tier = book.adaptedTier ? "改写" : LEVEL_LABEL[book.level] ?? "";

          return (
            <div
              key={book.id}
              role="option"
              aria-selected={isActive}
              tabIndex={-1}
              className={`shelf-slide${isActive ? " is-active" : ""}`}
              data-abs={abs}
              style={
                {
                  "--offset": offset,
                  "--abs": abs,
                  zIndex: 100 - abs,
                } as CSSProperties
              }
              onClick={() => {
                if (isActive) router.push(`/book/${book.slug}`);
                else setActive(index);
              }}
            >
              <BookCover slug={book.slug} title={book.title} emoji={book.coverEmoji} size="lg" src={book.cover} />
              <div className="shelf-slide-title">{book.title}</div>
              <div className="shelf-slide-author">{book.author}</div>
              <div className="shelf-slide-foot">
                <span>{tier}</span>
                <span>{book.chapterCount} 章</span>
                {book.challenge && <span className="shelf-slide-tag">挑战</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shelf-carousel-hint">
        <button type="button" className="shelf-carousel-nav" aria-label="上一本" onClick={() => move(-1)}>
          <ChevronLeft size={15} />
        </button>
        <span>
          {active + 1} / {count}
          <span className="shelf-hint-keys"> · 滚轮上滑向左 · 下滑向右</span> · 点击中间进入
        </span>
        <button type="button" className="shelf-carousel-nav" aria-label="下一本" onClick={() => move(1)}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
