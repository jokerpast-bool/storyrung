"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { gradeLevelAnswers, moreLevelItems, revealLevelAnswer, submitLevelTest } from "@/app/actions";
import type { Level } from "@/lib/domain/types";

interface TestOption {
  id: string;
  text: string;
}

interface Item {
  id: string;
  lemma: string;
  phonetic: string;
  pos: string;
  band: number;
  bandLabel: string;
  options: TestOption[];
}

interface BandRow {
  band: number;
  label: string;
  correct: number;
  total: number;
  rate: number;
}

interface Result {
  vocabSize: number;
  level: Level;
  correctCount: number;
  total: number;
  bands: BandRow[];
}

const LETTERS = ["A", "B", "C", "D"];
const INITIAL_SIZE = 24;
const EXTRA_PER_ROUND = 2; // 每段追加 2 个 → 一轮 12 题

function BandList({ bands }: { bands: BandRow[] }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="quiz-sub">分段正确率</div>
      {bands.map((band) => {
        const corrected = band.total > 0 ? Math.max(0, (band.rate - 0.25) / 0.75) : 0;
        return (
          <div key={band.band}>
            <div className="kv" style={{ padding: "2px 0" }}>
              <span className="tiny">{band.label}</span>
              <b className="tiny">
                {band.correct}/{band.total}
              </b>
            </div>
            <div className="meter" style={{ height: 5 }}>
              <i style={{ width: `${Math.max(2, Math.round(corrected * 100))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LevelTest({ items: initialItems }: { items: Item[] }) {
  const [stage, setStage] = useState<"intro" | "quiz" | "checkpoint" | "result">("intro");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<{ itemId: string; chosen: string }[]>([]);
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reveal, setReveal] = useState<{ chosen: string; correct: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const item = items[cursor];

  function advance(chosen: string) {
    // 最后一道题提交后要等服务端统计，这段时间题面还在，防重复记录同一条作答
    if (answers.some((row) => row.itemId === item.id)) return;
    const next = [...answers, { itemId: item.id, chosen }];
    setAnswers(next);
    setReveal(null);
    if (cursor + 1 >= items.length) {
      startTransition(async () => {
        const snapshot = await gradeLevelAnswers(next);
        setPreview(snapshot);
        setStage("checkpoint");
      });
    } else {
      setCursor((c) => c + 1);
    }
  }

  async function answer(chosen: string) {
    if (checking || reveal || pending) return;
    setChecking(true);
    const info = await revealLevelAnswer(item.id, chosen);
    setChecking(false);
    if (!info) {
      advance(chosen);
      return;
    }
    // 高亮正确答案，停一下让眼睛扫到，再进下一题
    setReveal({ chosen, correct: info.correctText });
    window.setTimeout(() => advance(chosen), 900);
  }

  function loadMore() {
    startTransition(async () => {
      const more = await moreLevelItems(
        answers.map((row) => row.itemId),
        EXTRA_PER_ROUND,
      );
      if (!more.length) {
        setNotice("题库已经答完了，这一份结果就是最终结果。");
        setStage("checkpoint");
        return;
      }
      setNotice(null);
      // cursor 还停在上一题（已答过），追加题目后要跳到第一道新题
      setItems((prev) => [...prev, ...more]);
      setCursor(items.length);
      setStage("quiz");
    });
  }

  function finish() {
    startTransition(async () => {
      const outcome = await submitLevelTest(answers);
      setResult(outcome);
      setStage("result");
    });
  }

  function restart() {
    setStage("intro");
    setItems(initialItems);
    setCursor(0);
    setAnswers([]);
    setPreview(null);
    setResult(null);
    setNotice(null);
  }

  if (stage === "intro") {
    return (
      <div className="quiz-card">
        <h2 style={{ marginBottom: 4 }}>词汇量测评</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          看词选义 · 先答 {Math.min(INITIAL_SIZE, items.length)} 题
        </p>
        <p className="muted small" style={{ marginTop: 0 }}>
          答完还可以继续加答，答得越多，估得越准。
        </p>
        <div className="row" style={{ marginTop: "auto" }}>
          <button type="button" className="btn primary" onClick={() => setStage("quiz")}>
            开始测评 →
          </button>
          <Link href="/library" className="btn ghost">
            跳过，直接去书库
          </Link>
        </div>
      </div>
    );
  }

  if (stage === "checkpoint" && preview) {
    return (
      <div className="quiz-card">
        <div>
          <div className="quiz-sub">已答 {preview.total} 题，当前估计</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 52, fontFamily: "var(--serif)", fontWeight: 600 }}>
              {preview.vocabSize.toLocaleString()}
            </span>
            <span className="muted">词</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <span className={`badge ${preview.level === "cet6" ? "warn" : "accent"}`}>
              {preview.level === "cet6" ? "六级" : "四级"}
            </span>
            <span className="badge">
              答对 {preview.correctCount} / {preview.total}
            </span>
          </div>
          <p className="muted small" style={{ marginTop: 14 }}>
            {notice ?? "每段再多答 2 题，估计会更稳一些。"}
          </p>
        </div>

        <BandList bands={preview.bands} />

        <div className="row" style={{ marginTop: "auto" }}>
          <button type="button" className="btn primary" disabled={pending} onClick={loadMore}>
            {pending ? "出题中…" : "再答 12 题，更准"}
          </button>
          <button type="button" className="btn ghost" disabled={pending} onClick={finish}>
            就到这里，看结果
          </button>
        </div>
      </div>
    );
  }

  if (stage === "result" && result) {
    return (
      <div className="quiz-card">
        <div>
          <div className="quiz-sub">你的词汇量约为</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 52, fontFamily: "var(--serif)", fontWeight: 600 }}>
              {result.vocabSize.toLocaleString()}
            </span>
            <span className="muted">词</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <span className={`badge ${result.level === "cet6" ? "warn" : "accent"}`}>
              {result.level === "cet6" ? "六级" : "四级"}
            </span>
            <span className="badge">
              答对 {result.correctCount} / {result.total}
            </span>
          </div>
        </div>

        <BandList bands={result.bands} />

        <div className="row" style={{ marginTop: "auto" }}>
          <Link href="/library" className="btn primary">
            进入书库 →
          </Link>
          <button type="button" className="btn ghost" disabled={pending} onClick={loadMore}>
            再答几题
          </button>
          <button type="button" className="btn ghost" disabled={pending} onClick={restart}>
            重新测
          </button>
        </div>
      </div>
    );
  }

  const progress = Math.round((cursor / items.length) * 100);

  return (
    <div className="quiz-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="badge">{item.bandLabel}</span>
        <span className="quiz-sub">
          {cursor + 1} / {items.length}
        </span>
      </div>

      <div className="meter">
        <i style={{ width: `${progress}%` }} />
      </div>

      <div>
        <div className="quiz-word">{item.lemma}</div>
        <div className="quiz-sub">
          {item.phonetic ? `${item.phonetic}` : ""}
          {item.phonetic && item.pos ? " · " : ""}
          {item.pos ?? ""}
          {!item.phonetic && !item.pos ? "选择最接近的中文释义" : ""}
        </div>
      </div>

      <div className="options">
        {item.options.map((option, index) => {
          const isCorrect = reveal?.correct === option.text;
          const isWrong = Boolean(reveal) && reveal!.chosen === option.text && reveal!.correct !== option.text;
          return (
            <button
              key={option.id}
              type="button"
              className={`option${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
              disabled={checking || reveal !== null || pending}
              onClick={() => answer(option.text)}
            >
              <span className="muted" style={{ marginRight: 8 }}>
                {LETTERS[index]}
              </span>
              {option.text}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: "auto", alignSelf: "flex-start" }}
        disabled={checking || reveal !== null || pending}
        onClick={() => answer("__dont_know__")}
      >
        不认识，跳过
      </button>
    </div>
  );
}
