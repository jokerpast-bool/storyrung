import type { Level } from "./types";

/** 目标词汇量：四级 4500、六级 6000（大纲口径，可配置）。 */
export const LEVEL_VOCAB: Record<Level, number> = { cet4: 4500, cet6: 6000 };

/** 词汇量 → 等级。4500 是分界线，低于它走四级线。 */
export function levelFromVocab(vocabSize: number): Level {
  return vocabSize >= LEVEL_VOCAB.cet4 ? "cet6" : "cet4";
}

export interface Bucket {
  band: number;
  from: number;
  to: number;
  label: string;
}

export const BUCKETS: Bucket[] = [
  { band: 1, from: 0, to: 2000, label: "核心 2000" },
  { band: 2, from: 2000, to: 3000, label: "2000–3000" },
  { band: 3, from: 3000, to: 4000, label: "3000–4000" },
  { band: 4, from: 4000, to: 5000, label: "4000–5000" },
  { band: 5, from: 5000, to: 6000, label: "5000–6000" },
  { band: 6, from: 6000, to: 8000, label: "6000–8000" },
];

/** 四选一猜对的基准概率：estimate 时要扣掉它，否则所有人都虚高。 */
export const GUESS_RATE = 0.25;

export interface BandAccuracy {
  band: number;
  total: number;
  correct: number;
}

export function bandCorrectedRate(correct: number, total: number): number {
  if (total <= 0) return 0;
  // 猜对修正：把"随机猜也能对 25%"的那部分扣掉，再归一化到 0~1
  const raw = correct / total;
  return Math.max(0, Math.min(1, (raw - GUESS_RATE) / (1 - GUESS_RATE)));
}

/**
 * 词汇量估计（看词选义版本）：
 * 每段扣掉猜对率后的正确率 p_b，按段宽加权求和。
 * 四选一必然蒙对一部分，不扣会集体虚高约 600~900 词。
 */
export function estimateVocabSize(bands: BandAccuracy[]): number {
  let total = 0;
  for (const bucket of BUCKETS) {
    const row = bands.find((b) => b.band === bucket.band);
    if (!row || row.total === 0) continue;
    total += (bucket.to - bucket.from) * bandCorrectedRate(row.correct, row.total);
  }
  return Math.max(500, Math.min(12000, Math.round(total)));
}

/**
 * 置信度：题量 + 极端一致性 + 频段覆盖。
 * 全对或全错都不可信（要么真强，要么在乱点），所以极端时给低分。
 */
export function estimateConfidence(bands: BandAccuracy[]): number {
  const total = bands.reduce((acc, b) => acc + b.total, 0);
  if (total === 0) return 0;
  const correct = bands.reduce((acc, b) => acc + b.correct, 0);
  const accuracy = correct / total;
  const extreme = Math.max(accuracy, 1 - accuracy);
  const coverage = new Set(bands.filter((b) => b.total > 0).map((b) => b.band)).size / BUCKETS.length;
  const volume = Math.min(1, total / 24);
  return Math.round((0.5 * volume + 0.3 * coverage + 0.2 * (1 - extreme)) * 100) / 100;
}

/** 把频段正确率转成结果页可直接画的数据。 */
export function bandSummary(bands: BandAccuracy[]) {
  return BUCKETS.map((bucket) => {
    const row = bands.find((b) => b.band === bucket.band) ?? { band: bucket.band, total: 0, correct: 0 };
    return {
      band: bucket.band,
      label: bucket.label,
      from: bucket.from,
      to: bucket.to,
      correct: row.correct,
      total: row.total,
      rate: row.total === 0 ? 0 : row.correct / row.total,
    };
  });
}
