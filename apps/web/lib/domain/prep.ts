import type { VocabEntry, VocabStatus } from "./types";

/**
 * 预习包上限。设上限是产品能跑通的前提：
 * 每章 12 词 + 4 短语 + 3 长难句，超过就截断（按重要度），保证预习 3~5 分钟能完成。
 */
export const PREP_LIMITS = {
  words: 12,
  phrases: 4,
  sentences: 3,
  /** 核心词掌握度门槛 */
  minMastery: 0.7,
  /** 通关后要求的覆盖率 */
  targetCoverage: 0.97,
} as const;

export interface VocabStateLike {
  lemma: string;
  status: VocabStatus;
  mastery: number;
}

const STATE_PRIORITY: Record<VocabStatus, number> = {
  unknown: 0,
  learning: 1,
  uncertain: 2,
  known: 3,
};

export interface PrepPackage {
  words: VocabEntry[];
  phrases: VocabEntry[];
  totalSteps: number;
}

/**
 * 选出"这一章这个人该练什么"。
 * 规则：状态越不确定越优先 → 重要度越高越优先 → 只剩词形干净、有中文释义的条目。
 */
export function selectPrepPackage(
  vocab: VocabEntry[],
  states: Map<string, VocabStateLike>,
  limits = PREP_LIMITS,
): PrepPackage {
  const usable = vocab.filter((v) => v.definitionZh.trim().length > 0);

  const scored = usable.map((v) => {
    const state = states.get(v.lemma);
    const status = state?.status ?? (v.band === "cet4" ? "known" : "uncertain");
    const mastery = state?.mastery ?? (status === "known" ? 0.95 : 0.3);
    // 已经稳定掌握的词不再练，保留少量高重要度词做复习
    const need = status === "known" && mastery >= 0.85 ? -1 : 1 - mastery;
    return { v, status, need, score: need * 0.6 + v.importance * 0.4 };
  });

  const words = scored
    .filter((s) => s.v.kind === "word" && s.need > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limits.words)
    .map((s) => s.v);

  const phrases = scored
    .filter((s) => s.v.kind === "phrase" && s.need > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limits.phrases)
    .map((s) => s.v);

  return { words, phrases, totalSteps: words.length + phrases.length };
}

/**
 * 掌握度更新。
 * 关键约束：预习里每个词只问一次，所以"一次答对"必须足以接近通关线，
 * 否则用户把 12 个词全答对也永远解锁不了（这是设计 bug，实测踩到过）。
 *   - 首次答对：+0.6 × (1 - mastery) → 0.3 起步可到 0.72
 *   - 已练过再加练：+0.15 × (1 - mastery)
 *   - 答错：腰斩（0.3 → 0.15），需要再练一次才能回到线以上
 * 反应快于 1.2s 视为可能猜对，加成打 6 折。
 */
export function nextMastery(current: number, correct: boolean, latencyMs = 3000): number {
  const m = Math.max(0, Math.min(1, current));
  if (!correct) return Math.max(0.05, m * 0.5);
  const speedFactor = latencyMs < 1200 ? 0.6 : 1;
  const boost = m <= 0.35 ? 0.6 : 0.15;
  return Math.min(1, m + boost * (1 - m) * speedFactor);
}

export interface PrepGateInput {
  coverages: { lemma: string; mastery: number }[];
  /** 覆盖率只作参考，不参与判定（12 个核心词对整章覆盖率的抬升有限） */
  currentCoverage?: number;
  skipped?: boolean;
}

/**
 * 通关判定：核心词平均掌握度 ≥ 0.70，或用户显式跳过。
 * 与 prep-session 里的 prepScore >= PREP_LIMITS.minMastery 是同一套口径。
 */
export function isPrepPassed(input: PrepGateInput): boolean {
  if (input.skipped) return true;
  if (input.coverages.length === 0) return true;
  const average =
    input.coverages.reduce((acc, c) => acc + c.mastery, 0) / input.coverages.length;
  return average >= PREP_LIMITS.minMastery;
}

/** 通关进度 0~1，用于页面上的进度环。 */
export function prepProgress(coverages: { mastery: number }[]): number {
  if (coverages.length === 0) return 1;
  const sum = coverages.reduce((acc, c) => acc + Math.min(1, c.mastery / PREP_LIMITS.minMastery), 0);
  return Math.min(1, sum / coverages.length);
}

/**
 * 选项用的短释义：ECDICT 的中文释义常常一次列 5~6 个义项，
 * 直接当四个选项会看不出差别，这里取前两个义项并截断。
 */
export function shortGloss(definition: string, maxSenses = 2, maxLen = 34): string {
  const parts = definition
    .split(/[；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let out = parts.slice(0, maxSenses).join("；");
  if (!out) out = definition.trim();
  if (out.length > maxLen) out = `${out.slice(0, maxLen)}…`;
  return out;
}

/**
 * 通关判定用的"核心词集合"：按重要度取前 N 个，与用户掌握度无关。
 * 必须和"本次要练什么"（会随掌握度收缩）分开，否则练一个少一个，掌握度自然虚高。
 */
export function coreGateLemmas(vocab: VocabEntry[], limits: { words: number } = PREP_LIMITS): string[] {
  return vocab
    .filter((v) => v.kind === "word" && v.definitionZh.trim().length > 0)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limits.words)
    .map((v) => v.lemma);
}

/** 核心词集合的平均掌握度（未出现的按初始 0.3 计）。 */
export function coreMasteryScore(
  coreLemmas: string[],
  mastery: (lemma: string) => number | undefined,
): number {
  if (coreLemmas.length === 0) return 1;
  const sum = coreLemmas.reduce((acc, lemma) => acc + (mastery(lemma) ?? 0.3), 0);
  return sum / coreLemmas.length;
}
