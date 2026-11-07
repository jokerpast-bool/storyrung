import type { AdmissionResult } from "./types";

/**
 * 选书准入闸（硬约束，不是软打分）。阈值由内容管线对真实文本的实测结果校准：
 *   - Hu & Nation (2000)：95% 是"能读懂大意"下限，98% 才叫舒适；
 *   - 实测公版书（4500 词基准）中位数 94.4%~94.9%，句均生词 0.82；
 *   - 因此四级线定 94%/0.9，六级线定 96.5%/0.7，硬底线 93%。
 * 阈值改动要同时改 content-pipeline/build.mjs 的 ADMISSION，两边必须一致。
 */
export const ADMISSION = {
  cet4: { coverage: 0.94, perSentence: 0.9 },
  cet6: { coverage: 0.965, perSentence: 0.7 },
  hardFloor: 0.93,
} as const;

export function admissionFor(level?: string | null) {
  return level === "cet6" ? ADMISSION.cet6 : ADMISSION.cet4;
}

export type LemmaCounts = Record<string, number>;

/** 覆盖率 = 已知词出现次数 / 总词次数（按 token 计数，不按词形种类）。 */
export function coverage(counts: LemmaCounts, known: ReadonlySet<string>): number {
  let total = 0;
  let hit = 0;
  for (const [lemma, n] of Object.entries(counts)) {
    total += n;
    if (known.has(lemma)) hit += n;
  }
  return total === 0 ? 0 : hit / total;
}

/** 句均生词：生词出现次数 / 句子数。 */
export function unknownPerSentence(
  counts: LemmaCounts,
  known: ReadonlySet<string>,
  sentenceCount: number,
): number {
  if (sentenceCount <= 0) return 0;
  let unknown = 0;
  for (const [lemma, n] of Object.entries(counts)) {
    if (!known.has(lemma)) unknown += n;
  }
  return unknown / sentenceCount;
}

export function evaluateAdmission(
  cov: number,
  perSentence: number,
  level?: string | null,
): AdmissionResult {
  const threshold = admissionFor(level);
  const reasons: string[] = [];
  if (cov < ADMISSION.hardFloor) {
    reasons.push(
      `覆盖率 ${(cov * 100).toFixed(1)}% 低于硬底线 ${(ADMISSION.hardFloor * 100).toFixed(0)}%`,
    );
  }
  if (cov < threshold.coverage) {
    reasons.push(`覆盖率 ${(cov * 100).toFixed(1)}% < ${(threshold.coverage * 100).toFixed(1)}%`);
  }
  if (perSentence > threshold.perSentence) {
    reasons.push(
      `句均生词 ${perSentence.toFixed(2)} > ${threshold.perSentence}`,
    );
  }
  return { pass: reasons.length === 0, coverage: cov, unknownPerSentence: perSentence, reasons };
}

/**
 * 基准读者：按词汇量 n 认定"认识词频前 n 的词"。
 * 用于离线判定一本书对某等级是否准入（不依赖具体用户）。
 */
export function baselineKnownSet(
  rankOf: Map<string, number>,
  vocabSize: number,
): Set<string> {
  const known = new Set<string>();
  for (const [lemma, rank] of rankOf) {
    if (rank > 0 && rank <= vocabSize) known.add(lemma);
  }
  return known;
}

/** 每章可读性摘要，供书目录展示。 */
export interface ChapterReadability {
  chapterId: string;
  coverage: number;
  unknownWords: number;
}

export function chapterReadability(
  counts: LemmaCounts,
  known: ReadonlySet<string>,
): { coverage: number; unknownWords: number } {
  let unknownWords = 0;
  for (const lemma of Object.keys(counts)) if (!known.has(lemma)) unknownWords += 1;
  return { coverage: coverage(counts, known), unknownWords };
}
