import { prisma } from "@/lib/db";
import { BUCKETS } from "@/lib/domain/level";
import { shortGloss } from "@/lib/domain/prep";

export interface TestOption {
  id: string;
  text: string;
}

export interface TestItem {
  id: string;
  lemma: string;
  phonetic: string;
  pos: string;
  band: number;
  bandLabel: string;
  options: TestOption[];
}

/** 可复现的伪随机：同一道题每次生成的选项顺序一致，刷新页面不会跳。 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleSeeded<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const OPTION_IDS = ["a", "b", "c", "d"];

/**
 * 生成一次「看词选义」测试：每个频段随机抽 4 个词，共 24 题。
 * 题库每段 40 个（共 240），每次随机取，反复测不会撞同一份卷子；
 * 单题内部选项顺序仍由题目 id 决定，刷新不跳。
 */
export async function buildLevelTest(perBand = 4): Promise<TestItem[]> {
  const all = await prisma.levelItem.findMany({ orderBy: [{ band: "asc" }, { freqRank: "asc" }] });
  if (all.length === 0) return [];

  const roundSalt = crypto.randomUUID();
  const picked: typeof all = [];
  for (const bucket of BUCKETS) {
    const pool = all.filter((item) => item.band === bucket.band);
    const seed = hashString(`pick-${bucket.band}-${roundSalt}`);
    picked.push(...shuffleSeeded(pool, seed).slice(0, perBand));
  }

  const glosses = [...new Set(all.map((item) => shortGloss(item.definitionZh)).filter((g) => g.length > 1))];

  // 音标不在 LevelItem 里（题库表只留题干），从词表索引补齐
  const phonetics = await prisma.lemmaIndex.findMany({
    where: { lemma: { in: picked.map((item) => item.lemma) } },
    select: { lemma: true, phonetic: true, pos: true },
  });
  const phoneticOf = new Map(phonetics.map((row) => [row.lemma, row.phonetic]));

  return picked.map((item) => {
    const correct = shortGloss(item.definitionZh);
    const seed = hashString(item.id);
    const distractors: string[] = [];
    for (const candidate of shuffleSeeded(
      glosses.filter((g) => g !== correct),
      seed,
    )) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(candidate)) distractors.push(candidate);
    }
    while (distractors.length < 3) distractors.push("（以上都不是）");

    const texts = shuffleSeeded([correct, ...distractors], seed ^ 0x9e3779b9);
    return {
      id: item.id,
      lemma: item.lemma,
      phonetic: phoneticOf.get(item.lemma) ?? "",
      pos: item.pos ?? "",
      band: item.band,
      bandLabel: BUCKETS.find((b) => b.band === item.band)?.label ?? `第 ${item.band} 段`,
      options: texts.map((text, index) => ({ id: OPTION_IDS[index], text })),
    };
  });
}

/** 判分：把用户选的文本与题库里的正确释义比对（选项 id 只是展示用）。 */
export async function gradeLevelTest(
  answers: { itemId: string; chosen: string }[],
): Promise<{ item: { id: string; lemma: string; band: number }; correct: boolean }[]> {
  const items = await prisma.levelItem.findMany({
    where: { id: { in: answers.map((a) => a.itemId) } },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return answers.flatMap((answer) => {
    const item = byId.get(answer.itemId);
    if (!item) return [];
    return [
      {
        item: { id: item.id, lemma: item.lemma, band: item.band },
        correct: shortGloss(item.definitionZh) === answer.chosen,
      },
    ];
  });
}
