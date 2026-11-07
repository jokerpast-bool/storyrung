"use client";

import { useState, useTransition } from "react";

import { gradeCard } from "@/app/actions";

interface Card {
  lemma: string;
  definitionZh: string;
  reps: number;
}

const GRADES: { grade: 0 | 1 | 2 | 3; label: string; hint: string }[] = [
  { grade: 0, label: "忘了", hint: "回到 1 天" },
  { grade: 1, label: "勉强", hint: "间隔 ×1.2" },
  { grade: 2, label: "记得", hint: "间隔 ×ease" },
  { grade: 3, label: "很简单", hint: "间隔 ×1.3ease" },
];

export default function ReviewTrainer({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [log, setLog] = useState<{ lemma: string; label: string }[]>([]);
  const [pending, startTransition] = useTransition();

  if (index >= cards.length) {
    return (
      <div className="quiz-card">
        <h2 style={{ marginBottom: 4 }}>本轮复习完成</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          共复习 {log.length} 张。
        </p>
        <div className="stack">
          {log.slice(-10).map((item, i) => (
            <div key={`${item.lemma}-${i}`} className="kv">
              <span>{item.lemma}</span>
              <b>{item.label}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const card = cards[index];

  function grade(g: 0 | 1 | 2 | 3) {
    const label = GRADES.find((x) => x.grade === g)?.label ?? "";
    setLog((prev) => [...prev, { lemma: card.lemma, label }]);
    startTransition(async () => {
      await gradeCard({ lemma: card.lemma, grade: g });
      setRevealed(false);
      setIndex((i) => i + 1);
    });
  }

  return (
    <div className="quiz-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="badge">第 {index + 1} / {cards.length} 张</span>
        <span className="quiz-sub">已复习 {card.reps} 次</span>
      </div>

      <div>
        <div className="quiz-word">{card.lemma}</div>
      </div>

      {revealed ? (
        <>
          <div className="note">{card.definitionZh || "（暂无释义）"}</div>
          <div className="options">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                type="button"
                className="option"
                disabled={pending}
                onClick={() => grade(g.grade)}
              >
                <b>{g.label}</b>
                <span className="muted small"> · {g.hint}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="btn primary" style={{ marginTop: "auto" }} onClick={() => setRevealed(true)}>
          翻面看释义
        </button>
      )}
    </div>
  );
}
