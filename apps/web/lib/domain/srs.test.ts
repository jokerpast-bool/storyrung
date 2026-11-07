import assert from "node:assert/strict";
import { test } from "node:test";

import { dueDate, schedule } from "./srs";

const fresh = { intervalDays: 0, ease: 2.5, lapses: 0, reps: 0 };

test("第一次记得 → 间隔放大，reps +1", () => {
  const next = schedule(fresh, 2);
  assert.equal(next.reps, 1);
  assert.ok(next.intervalDays >= 1);
  assert.equal(next.lapses, 0);
});

test("忘了 → 回到 1 天、ease 下降、lapses +1", () => {
  const next = schedule({ intervalDays: 10, ease: 2.5, lapses: 0, reps: 3 }, 0);
  assert.equal(next.intervalDays, 1);
  assert.equal(next.lapses, 1);
  assert.ok(next.ease < 2.5);
});

test("间隔有上下界（1~365 天，ease 1.3~3.2）", () => {
  let state = { intervalDays: 300, ease: 3.1, lapses: 0, reps: 50 };
  for (let i = 0; i < 5; i += 1) state = schedule(state, 3);
  assert.ok(state.intervalDays <= 365);
  assert.ok(state.ease <= 3.2);

  let hard = { intervalDays: 5, ease: 1.35, lapses: 0, reps: 5 };
  for (let i = 0; i < 5; i += 1) hard = schedule(hard, 1);
  assert.ok(hard.ease >= 1.3);
});

test("easy 比 good 拉得更长", () => {
  const good = schedule(fresh, 2);
  const easy = schedule(fresh, 3);
  assert.ok(easy.intervalDays >= good.intervalDays);
  assert.ok(easy.ease > good.ease);
});

test("到期日按天数顺延", () => {
  const from = new Date("2026-10-29T00:00:00Z");
  assert.equal(dueDate(from, 3).toISOString().slice(0, 10), "2026-11-01");
});
