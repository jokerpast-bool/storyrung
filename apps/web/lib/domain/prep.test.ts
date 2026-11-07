import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PREP_LIMITS,
  coreGateLemmas,
  coreMasteryScore,
  isPrepPassed,
  nextMastery,
  selectPrepPackage,
  shortGloss,
} from "./prep";
import type { VocabEntry } from "./types";

function vocab(lemma: string, overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    lemma,
    kind: "word",
    surfaceForms: [lemma],
    pos: "n",
    phonetic: "",
    definitionZh: `${lemma} 的释义`,
    freqRank: 5000,
    band: "cet6",
    importance: 0.5,
    occurrenceCount: 1,
    ...overrides,
  };
}

test("首次答对一步到通关线之上（预习每个词只问一次）", () => {
  const once = nextMastery(0.3, true, 3000);
  assert.ok(once >= PREP_LIMITS.minMastery, `expected >= 0.7, got ${once}`);
  // 再练只加小步，避免刷分
  assert.ok(nextMastery(once, true, 3000) - once < 0.1);
  // 答错腰斩
  assert.equal(nextMastery(0.3, false, 3000), 0.15);
  // 秒选（<1.2s）视为可能猜对，加成打折
  assert.ok(nextMastery(0.3, true, 500) < once);
});

test("核心词集合与掌握度无关（否则练一个少一个，分数虚高）", () => {
  const entries = [
    vocab("a", { importance: 0.9 }),
    vocab("b", { importance: 0.8 }),
    vocab("c", { importance: 0.7 }),
    vocab("d", { importance: 0.6 }),
  ];
  const core = coreGateLemmas(entries, { ...PREP_LIMITS, words: 2 });
  assert.deepEqual(core, ["a", "b"]);
  // 即使 a、b 已掌握，集合不变
  assert.deepEqual(coreGateLemmas(entries, { ...PREP_LIMITS, words: 2 }), ["a", "b"]);
});

test("通关分：未出现的词按 0.3 计", () => {
  const score = coreMasteryScore(["a", "b"], (lemma) => (lemma === "a" ? 1 : undefined));
  assert.equal(score, 0.65);
  assert.equal(coreMasteryScore([], () => undefined), 1);
});

test("预习包只收没掌握的词，并按上限截断", () => {
  const entries = Array.from({ length: 30 }, (_, i) =>
    vocab(`w${i}`, { importance: (30 - i) / 30 }),
  );
  const states = new Map([["w0", { lemma: "w0", status: "known" as const, mastery: 0.95 }]]);
  const pkg = selectPrepPackage(entries, states);
  assert.equal(pkg.words.length, PREP_LIMITS.words);
  assert.ok(!pkg.words.some((w) => w.lemma === "w0"), "已掌握的高分词不应出现在预习包里");
  assert.equal(pkg.totalSteps, pkg.words.length + pkg.phrases.length);
});

test("没有释义的词不进预习包（否则选项没法出）", () => {
  const pkg = selectPrepPackage([vocab("blank", { definitionZh: "  " })], new Map());
  assert.equal(pkg.words.length, 0);
});

test("通关判定：掌握度达标即通过，跳过也算通过", () => {
  assert.equal(isPrepPassed({ coverages: [{ lemma: "a", mastery: 0.7 }], currentCoverage: 0.9 }), true);
  assert.equal(isPrepPassed({ coverages: [{ lemma: "a", mastery: 0.5 }], currentCoverage: 0.99 }), false);
  assert.equal(isPrepPassed({ coverages: [{ lemma: "a", mastery: 0.1 }], currentCoverage: 0.1, skipped: true }), true);
});

test("短释义：截取前两个义项并限长", () => {
  const gloss = shortGloss("n. 兔子；野兔；兔肉；兔皮；胆小的人");
  assert.equal(gloss, "n. 兔子；野兔");
  assert.ok(shortGloss("a".repeat(80)).length <= 35);
});
