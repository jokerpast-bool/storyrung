"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { lookupWord, savePosition } from "@/app/actions";

interface TokenLike {
  surface: string;
  lemma: string;
  start: number;
  end: number;
}

interface SentenceLike {
  index: number;
  text: string;
  tokens: TokenLike[];
}

interface LookupResult {
  lemma: string;
  definitionZh: string;
  phonetic: string;
  pos: string;
  band: string;
  freqRank: number;
  inChapter: boolean;
}

interface Props {
  chapterId: string;
  bookSlug: string;
  bookTitle: string;
  chapterTitle: string;
  wordCount: number;
  estMinutes: number;
  sentences: SentenceLike[];
  startPosition: number;
}

const BAND_LABEL: Record<string, string> = { cet4: "四级", cet6: "六级", beyond: "超纲" };

export default function Reader(props: Props) {
  const { chapterId, bookSlug, sentences } = props;
  const [active, setActive] = useState(props.startPosition);
  const [fontSize, setFontSize] = useState(19);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; data: LookupResult } | null>(null);
  const [loadingWord, setLoadingWord] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lastSaved = useRef(props.startPosition);

  const closePopover = useCallback(() => {
    setPopover(null);
    setActiveWord(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePopover();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePopover]);

  const handleWord = useCallback(
    (event: React.MouseEvent, lemma: string) => {
      event.stopPropagation();
      event.preventDefault();
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      setLoadingWord(lemma);
      startTransition(async () => {
        const data = await lookupWord({ chapterId, lemma });
        setLoadingWord(null);
        setActiveWord(lemma);
        setPopover({
          x: rect.left,
          y: rect.bottom + 10,
          data:
            data ??
            {
              lemma,
              definitionZh: "词库里没有这个词（可能是人名或专有名词）",
              phonetic: "",
              pos: "",
              band: "beyond",
              freqRank: 0,
              inChapter: false,
            },
        });
      });
    },
    [chapterId],
  );

  function selectSentence(index: number) {
    setActive(index);
    if (lastSaved.current !== index) {
      lastSaved.current = index;
      startTransition(async () => {
        await savePosition({ chapterId, position: index });
      });
    }
  }

  function jumpTo(position: number) {
    const index = Math.max(0, Math.min(sentences.length - 1, position));
    selectSentence(index);
    document.getElementById(`sentence-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const progress = useMemo(() => {
    if (sentences.length === 0) return 0;
    return Math.round(((active + 1) / sentences.length) * 100);
  }, [active, sentences.length]);

  return (
    <main className="reader-shell" onClick={closePopover}>
      <div className="reader-toolbar">
        <Link href={`/book/${bookSlug}`} className="btn ghost" style={{ padding: "6px 10px" }}>
          <ChevronLeft size={16} />
          目录
        </Link>

        <div className="reader-tools">
          <span className="reader-progress-label">{progress}%</span>
          <div className="tool-group">
            <button
              type="button"
              className="icon-btn"
              aria-label="缩小字号"
              onClick={() => setFontSize((size) => Math.max(16, size - 1))}
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="放大字号"
              onClick={() => setFontSize((size) => Math.min(28, size + 1))}
            >
              <Plus size={15} />
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="回到上次位置"
            aria-label="回到上次位置"
            onClick={() => jumpTo(props.startPosition)}
          >
            <History size={15} />
          </button>
        </div>
      </div>

      <div className="reader-progress">
        <i style={{ width: `${progress}%` }} />
      </div>

      <article className="reader-page">
        <header className="reader-head">
          <div className="reader-book">{props.bookTitle}</div>
          <h1>{props.chapterTitle}</h1>
          <div className="reader-meta">
            {props.wordCount} 词 · 约 {props.estMinutes} 分钟 · {sentences.length} 句
          </div>
        </header>

        <div className="reader-column" style={{ fontSize }}>
          {sentences.map((sentence) => (
            <p
              key={sentence.index}
              id={`sentence-${sentence.index}`}
              className={`sent ${active === sentence.index ? "is-active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                selectSentence(sentence.index);
              }}
            >
              {renderTokens(sentence, activeWord, loadingWord, handleWord)}
            </p>
          ))}
        </div>

        <footer className="reader-foot">
          <button
            type="button"
            className="btn ghost"
            disabled={active <= 0}
            onClick={(event) => {
              event.stopPropagation();
              jumpTo(active - 1);
            }}
          >
            <ChevronLeft size={16} />
            上一段
          </button>
          <Link className="btn" href={`/review?chapter=${chapterId}`}>
            读完了，去复习
          </Link>
          <button
            type="button"
            className="btn ghost"
            disabled={active >= sentences.length - 1}
            onClick={(event) => {
              event.stopPropagation();
              jumpTo(active + 1);
            }}
          >
            下一段
            <ChevronRight size={16} />
          </button>
        </footer>
      </article>

      {popover && (
        <div
          className="popover"
          style={{
            position: "fixed",
            left: Math.min(popover.x, window.innerWidth - 340),
            top: Math.min(popover.y, window.innerHeight - 230),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="popover-head">
            <span className="popover-word">{popover.data.lemma}</span>
            <span className={`badge ${popover.data.band === "cet4" ? "accent" : popover.data.band === "cet6" ? "warn" : ""}`}>
              {BAND_LABEL[popover.data.band] ?? "超纲"}
            </span>
          </div>
          <div className="popover-sub">
            {popover.data.phonetic && <span className="popover-phonetic">{popover.data.phonetic}</span>}
            {popover.data.pos && <span>{popover.data.pos}</span>}
            {popover.data.freqRank > 0 && <span>词频 #{popover.data.freqRank}</span>}
          </div>
          <div className="popover-def">{popover.data.definitionZh}</div>
          <div className="popover-foot">已加入生词本 · 按 Esc 关闭</div>
        </div>
      )}
    </main>
  );
}

function renderTokens(
  sentence: SentenceLike,
  activeWord: string | null,
  loadingWord: string | null,
  onWord: (event: React.MouseEvent, lemma: string) => void,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  sentence.tokens.forEach((token, i) => {
    if (token.start > cursor) {
      nodes.push(<span key={`gap-${i}`}>{sentence.text.slice(cursor, token.start)}</span>);
    }
    const className = [
      "w",
      activeWord === token.lemma ? "is-active-word" : "",
      loadingWord === token.lemma ? "is-loading" : "",
    ]
      .filter(Boolean)
      .join(" ");
    nodes.push(
      <span key={`w-${i}`} className={className} onClick={(event) => onWord(event, token.lemma)}>
        {sentence.text.slice(token.start, token.end)}
      </span>,
    );
    cursor = token.end;
  });
  if (cursor < sentence.text.length) {
    nodes.push(<span key="tail">{sentence.text.slice(cursor)}</span>);
  }
  return nodes;
}
