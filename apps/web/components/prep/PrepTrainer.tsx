"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { recordAttempt, skipPrep } from "@/app/actions";

interface WordLike {
  lemma: string;
  phonetic: string;
  pos: string;
  definitionZh: string;
  band: string;
}

interface SentenceLike {
  index: number;
  text: string;
  hardScore: number;
  keyVocab: string[];
}

interface Props {
  chapterId: string;
  bookSlug: string;
  chapterIndex: number;
  chapterTitle: string;
  words: WordLike[];
  phrases: WordLike[];
  options: Record<string, string[]>;
  hardSentences: SentenceLike[];
  initialScore: number;
  initialCoverage: number;
  initiallyUnlocked: boolean;
}

type Step =
  | { kind: "word"; item: WordLike }
  | { kind: "phrase"; item: WordLike }
  | { kind: "sentence"; item: SentenceLike }
  | { kind: "done" };

export default function PrepTrainer(props: Props) {
  const { chapterId, bookSlug, chapterIndex } = props;
  const [score, setScore] = useState(props.initialScore);
  const [coverage, setCoverage] = useState(props.initialCoverage);
  const [unlocked, setUnlocked] = useState(props.initiallyUnlocked);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  const queue: Step[] = useMemo(
    () => [
      ...props.words.map<Step>((item) => ({ kind: "word", item })),
      ...props.phrases.map<Step>((item) => ({ kind: "phrase", item })),
      ...props.hardSentences.map<Step>((item) => ({ kind: "sentence", item })),
      { kind: "done" },
    ],
    [props.words, props.phrases, props.hardSentences],
  );

  const step = queue[Math.min(cursor, queue.length - 1)];
  const totalGraded = props.words.length + props.phrases.length;
  const gradedDone = queue.slice(0, cursor).filter((s) => s.kind === "word" || s.kind === "phrase").length;

  function pick(option: string) {
    if (step.kind !== "word" && step.kind !== "phrase") return;
    if (feedback) return;
    const correct = option === step.item.definitionZh;
    setPicked(option);
    setFeedback(correct ? "correct" : "wrong");
    const latency = Date.now() - startedAt;

    startTransition(async () => {
      const result = await recordAttempt({
        chapterId,
        lemma: step.item.lemma,
        exerciseType: "recognize",
        correct,
        latencyMs: latency,
      });
      setScore(result.prepScore);
      setCoverage(result.coverageAfter);
      setUnlocked(result.unlocked);
    });
  }

  function next() {
    setPicked(null);
    setFeedback(null);
    setStartedAt(Date.now());
    setCursor((c) => Math.min(c + 1, queue.length - 1));
  }

  if (step.kind === "done") {
    return (
      <div className="quiz-card">
        <h2 style={{ marginBottom: 4 }}>预习完成</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          掌握度 {score.toFixed(2)} / 0.70 · 覆盖率 {(coverage * 100).toFixed(1)}%
        </p>
        <div className={`note ${unlocked ? "" : "warn"}`}>
          {unlocked ? "已达标" : "未达标"}
        </div>
        <div className="row" style={{ marginTop: "auto" }}>
          <Link className="btn primary" href={`/book/${bookSlug}/${chapterIndex}/read`}>
            开始阅读 →
          </Link>
          <button
            type="button"
            className="btn ghost"
            disabled={pending}
            onClick={() => {
              setCursor(0);
              setFeedback(null);
              setPicked(null);
            }}
          >
            再练一遍
          </button>
          <Link className="btn ghost" href={`/book/${bookSlug}`}>
            回到目录
          </Link>
        </div>
      </div>
    );
  }

  if (step.kind === "sentence") {
    return (
      <div className="quiz-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="badge warn">长难句 {step.item.index + 1}</span>
          <span className="quiz-sub">难度 {step.item.hardScore.toFixed(2)}</span>
        </div>
        <p className="reader" style={{ fontSize: 20, margin: 0, textIndent: 0 }}>
          {step.item.text}
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          主干（谁 + 做了什么）：
          {step.item.keyVocab.length > 0 ? step.item.keyVocab.join(" / ") : "—"}
        </p>
        <div className="row" style={{ marginTop: "auto" }}>
          <button type="button" className="btn primary" onClick={next}>
            读通了，继续 →
          </button>
        </div>
      </div>
    );
  }

  const item = step.item;
  const optionList = props.options[item.lemma] ?? [item.definitionZh];
  const bandLabel =
    item.band === "cet4" ? "四级" : item.band === "cet6" ? "六级" : "超纲";

  return (
    <div className="quiz-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="badge">{step.kind === "word" ? "词汇" : "短语"}</span>
        <span className="quiz-sub">
          已练 {gradedDone} / {totalGraded} · 掌握度 {score.toFixed(2)}
        </span>
      </div>

      <div>
        <div className="quiz-word">{item.lemma}</div>
        <div className="quiz-sub">
          {item.phonetic ? `${item.phonetic} · ` : ""}
          {item.pos ? `${item.pos} · ` : ""}
          {bandLabel}
        </div>
      </div>

      <div className="options">
        {optionList.map((option) => {
          const isPicked = picked === option;
          const isCorrect = option === item.definitionZh;
          const className = [
            "option",
            feedback && isPicked && isCorrect ? "correct" : "",
            feedback && isPicked && !isCorrect ? "wrong" : "",
            feedback && !isPicked && isCorrect ? "correct" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={option}
              type="button"
              className={className}
              disabled={Boolean(feedback)}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`note ${feedback === "correct" ? "" : "danger"}`} style={{ marginTop: "auto" }}>
          {feedback === "correct" ? "对了。" : "不对，正确释义已高亮。"}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn primary" onClick={next}>
              下一题 →
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginTop: "auto" }}>
        <span className="progress-ring">
          覆盖率 {(coverage * 100).toFixed(1)}% {unlocked ? "· 已解锁" : ""}
        </span>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            startTransition(async () => {
              await skipPrep({ chapterId, bookSlug, index: chapterIndex });
            })
          }
        >
          跳过，直接读
        </button>
      </div>
    </div>
  );
}
