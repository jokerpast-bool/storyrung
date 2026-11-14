import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUCKETS,
  GUESS_RATE,
  bandCorrectedRate,
  bandSummary,
  estimateVocabSize,
  levelFromVocab,
  type BandAccuracy,
} from "./level";

function bands(correctPerBand: number[], total = 4): BandAccuracy[] {
  return BUCKETS.map((bucket, index) => ({
    band: bucket.band,
    total,
    correct: correctPerBand[index] ?? 0,
  }));
}

test("全对 → 词汇量落在最高段上限", () => {
  assert.equal(estimateVocabSize(bands([4, 4, 4, 4, 4, 4])), 8000);
  assert.equal(levelFromVocab(8000), "cet6");
});

test("全错 → 夹到 500 下限", () => {
  assert.equal(estimateVocabSize(bands([0, 0, 0, 0, 0, 0])), 500);
  assert.equal(levelFromVocab(500), "cet4");
});

test("四选一蒙对 25% 不算会：全按猜对率答对 → 词汇量归零", () => {
  // 每段 4 题答对 1 题，正好是随机水平
  assert.equal(bandCorrectedRate(1, 4), 0);
  assert.equal(estimateVocabSize(bands([1, 1, 1, 1, 1, 1])), 500);
});

test("猜对修正后 50% 正确率 ≈ 33% 掌握", () => {
  const rate = bandCorrectedRate(2, 4);
  assert.ok(Math.abs(rate - (0.5 - GUESS_RATE) / (1 - GUESS_RATE)) < 1e-9);
  assert.equal(estimateVocabSize(bands([2, 2, 2, 2, 2, 2])), 2667);
});

test("分段覆盖不足时只按有数据的段加权", () => {
  const partial: BandAccuracy[] = [
    { band: 1, total: 4, correct: 4 },
    { band: 2, total: 0, correct: 0 },
  ];
  assert.equal(estimateVocabSize(partial), 2000);
  assert.equal(estimateVocabSize([]), 500);
});

test("词汇量 4500 是四级/六级分界线", () => {
  assert.equal(levelFromVocab(4499), "cet4");
  assert.equal(levelFromVocab(4500), "cet6");
});

test("bandSummary 输出结果页要画的六行", () => {
  const summary = bandSummary(bands([3, 2, 1, 0, 0, 0]));
  assert.equal(summary.length, 6);
  assert.equal(summary[0].correct, 3);
  assert.equal(summary[0].total, 4);
  assert.equal(summary[0].rate, 0.75);
  assert.equal(summary[3].rate, 0);
  // 缺数据的段不能除零
  assert.equal(bandSummary([])[0].rate, 0);
});
