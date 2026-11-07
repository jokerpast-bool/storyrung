"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { submitLevelTest } from "@/app/actions";

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
  level: "cet4" | "cet6";
  confidence: number;
  correctCount: number;
  total: number;
  bands: BandRow[];
}

const LETTERS = ["A", "B", "C", "D"];

export default function LevelTest({ items }: { items: Item[] }) {
  const [stage, setStage] = useState<"intro" | "quiz" | "result">("intro");
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<{ itemId: string; chosen: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const item = items[cursor];

  function answer(chosen: string) {
    if (pending) return;
    const next = [...answers, { itemId: item.id, chosen }];
    setAnswers(next);
    if (cursor + 1 >= items.length) {
      startTransition(async () => {
        const outcome = await submitLevelTest(next);
        setResult(outcome);
        setStage("result");
      });
    } else {
      setCursor((c) => c + 1);
    }
  }

  if (stage === "intro") {
    return (
      <div className="quiz-card">
        <h2 style={{ marginBottom: 4 }}>词汇量测评</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          看词选义 · {items.length} 题
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
            <span className="badge">答对 {result.correctCount} / {result.total}</span>
            <span className="badge">置信度 {(result.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="quiz-sub">分段正确率</div>
          {result.bands.map((band) => {
            const corrected = band.total > 0 ? Math.max(0, (band.rate - 0.25) / 0.75) : 0;
            return (
              <div key={band.band}>
                <div className="kv" style={{ padding: "2px 0" }}>
                  <span className="tiny">{band.label}</span>
                  <b className="tiny">{band.correct}/{band.total}</b>
                </div>
                <div className="meter" style={{ height: 5 }}>
                  <i style={{ width: `${Math.max(2, Math.round(corrected * 100))}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: "auto" }}>
          <Link href="/library" className="btn primary">
            进入书库 →
          </Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setStage("intro");
              setCursor(0);
              setAnswers([]);
              setResult(null);
            }}
          >
            再测一次
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
        {item.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className="option"
            disabled={pending}
            onClick={() => answer(option.text)}
          >
            <span className="muted" style={{ marginRight: 8 }}>
              {LETTERS[index]}
            </span>
            {option.text}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: "auto", alignSelf: "flex-start" }}
        disabled={pending}
        onClick={() => answer("__dont_know__")}
      >
        不认识，跳过
      </button>
    </div>
  );
}
