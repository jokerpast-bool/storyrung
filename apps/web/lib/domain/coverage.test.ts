import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADMISSION,
  admissionFor,
  chapterReadability,
  coverage,
  evaluateAdmission,
  unknownPerSentence,
} from "./coverage";

const counts = { the: 50, rabbit: 10, hole: 5, curious: 2 };

test("覆盖率按 token 次数算，不按词形种类", () => {
  // 已知 the/rabbit/hole = 65，总 67
  assert.ok(Math.abs(coverage(counts, new Set(["the", "rabbit", "hole"])) - 65 / 67) < 1e-9);
  assert.equal(coverage(counts, new Set()), 0);
  assert.equal(coverage({}, new Set(["the"])), 0);
});

test("句均生词 = 生词出现次数 / 句子数", () => {
  assert.equal(unknownPerSentence(counts, new Set(["the", "rabbit", "hole"]), 7), 2 / 7);
  assert.equal(unknownPerSentence(counts, new Set(["the", "rabbit", "hole"]), 0), 0);
});

test("四级阈值：94% 准入、93% 以下触发硬底线", () => {
  const pass = evaluateAdmission(0.95, 0.5, "cet4");
  assert.equal(pass.pass, true);

  const below = evaluateAdmission(0.935, 0.5, "cet4");
  assert.equal(below.pass, false);
  assert.match(below.reasons.join(" "), /94\.0%/);

  const hard = evaluateAdmission(0.92, 0.5, "cet4");
  assert.match(hard.reasons.join(" "), /硬底线/);
});

test("句均生词超限也会被拒（即使覆盖率够）", () => {
  const result = evaluateAdmission(0.99, 1.2, "cet4");
  assert.equal(result.pass, false);
  assert.match(result.reasons.join(" "), /句均生词/);
});

test("六级线严格于四级线", () => {
  assert.ok(ADMISSION.cet6.coverage > ADMISSION.cet4.coverage);
  assert.equal(admissionFor("cet6").coverage, ADMISSION.cet6.coverage);
  assert.equal(admissionFor("cet4").coverage, ADMISSION.cet4.coverage);
  // 未知等级按四级线处理，避免新用户直接被判成六级
  assert.equal(admissionFor("unknown").coverage, ADMISSION.cet4.coverage);
});

test("章节可读性：生词按词形种类计", () => {
  const readability = chapterReadability(counts, new Set(["the", "rabbit"]));
  assert.equal(readability.unknownWords, 2);
  assert.ok(readability.coverage > 0.89 && readability.coverage < 0.9);
});
