/**
 * 词汇量测评题库生成：从 ECDICT 的 COCA 频次里按频段取词。
 *
 * 目标：每段 40 个词（共 240），只保留"看得懂、译得准、能在四选一里区分开"的词。
 * 之前 build.mjs 里是一段内等距抽 8 个，题库只有 48 条，且 3000 以后的频段边界
 * 与前端 BUCKETS（3000–4000 / 4000–5000 / 5000–6000 / 6000–8000）对不上，这里一并修正。
 *
 * 单独跑：node content-pipeline/level-items.mjs
 */
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ECDICT_DIR = join(ROOT, "node_modules", "ecdict", "assets");
const DIST_DIR = join(ROOT, "data", "dist");

/** 与 apps/web/lib/domain/level.ts 的 BUCKETS 保持一致 */
export const BANDS = [
  { band: 1, from: 1, to: 2000 },
  { band: 2, from: 2001, to: 3000 },
  { band: 3, from: 3001, to: 4000 },
  { band: 4, from: 4001, to: 5000 },
  { band: 5, from: 5001, to: 6000 },
  { band: 6, from: 6001, to: 8000 },
];

export const PER_BAND = 40;

/** 这些词性太"功能词"，不适合做看词选义 */
const SKIP_POS = new Set(["prep", "pron", "conj", "aux", "num", "art", "int", "det", "pl"]);

/** 高频功能词：认识它们是"会英语"的前提，拿来测词汇量没有区分度 */
const FUNCTION_WORDS = new Set(
  `the of and a to in is you that it he was for on are as with his they i at be this have from or one had by
   word but not what all were we when your can said there use an each which she do how their if will up other
   about out many then them these so some her would make like him into time has look two more write go see number
   no way could people my than first water been call who oil its now find long down day did get come made may
   part over new sound take only little work know place year live me back give most very after thing our just
   name good sentence man think say great where help through much before line right too mean old any same tell
   boy follow came want show also around form three small set put end does another well large must big even such
   because turn here why ask went men read need land different home us move try kind hand picture again change
   off play spell air away animal house point page letter mother answer found study still learn should world
   those these this that such own other both either neither few several all none every each enough
   one two three four five six seven eight nine ten`
    .split(/\s+/)
    .filter(Boolean),
);

/** 粗俗词不进题库 */
const PROFANITY = new Set("bastard bitch damn shit fuck crap piss slut whore".split(" "));

/** 把 ECDICT 的 translation 清成一句可读的释义 */
export function cleanGloss(raw) {
  let text = String(raw ?? "")
    .replace(/\\n/g, "；")
    .replace(/\r/g, " ")
    .replace(/\[网络\][^；;\n]*/g, "")
    .replace(/\[[^\]]{1,8}\][^；;\n]*/g, "")
    .trim();
  // 去掉一个或多个开头的词性标记：n. / a. / vt. / adj. / abbr. …
  text = text.replace(/^(?:(?:a|ad|n|v|vt|vi|adj|adv|prep|pron|conj|aux|num|art|int|abbr|pl|suf|pref)\.[\s]*)+/i, "");
  const parts = text
    .split(/[；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    // 以词性开头的后续义项（"；vt. 使…"）对选择题来说是噪音，丢掉
    .filter((part) => !/^(?:a|ad|n|v|vt|vi|adj|adv|prep|pron|conj|aux|num|art|int|abbr)\.[\s]*/i.test(part));
  return parts
    .slice(0, 2)
    .join("；")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasHan(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * rows: [{ word, translation, phonetic, pos, frq }]，已按 word 小写去重。
 * 返回 { lemma, band, definitionZh, pos, freqRank }[]
 */
export function selectLevelItems(rows, perBand = PER_BAND) {
  const used = new Set();
  const out = [];

  for (const range of BANDS) {
    const pool = [];
    for (const row of rows) {
      const rank = row.freqRank;
      if (!rank || rank < range.from || rank > range.to) continue;
      if (!/^[a-z][a-z'-]*$/.test(row.lemma)) continue;
      if (row.lemma.length < 3 || row.lemma.length > 16) continue;
      if (SKIP_POS.has((row.pos || "").toLowerCase())) continue;
      if (row.properNoun) continue;
      if (FUNCTION_WORDS.has(row.lemma)) continue;
      if (PROFANITY.has(row.lemma)) continue;
      const gloss = cleanGloss(row.translation);
      if (gloss.length < 2 || gloss.length > 32) continue;
      if (!hasHan(gloss)) continue;
      if (/\.\.\.|…/.test(gloss)) continue;
      if (used.has(gloss)) continue;
      pool.push({ ...row, gloss });
    }

    pool.sort((a, b) => a.freqRank - b.freqRank);
    // 段内等距取样，避免全挤在段首那一小撮高频词上
    const picked = [];
    const step = Math.max(1, Math.floor(pool.length / perBand));
    for (let i = 0; i < pool.length && picked.length < perBand; i += step) {
      const row = pool[i];
      if (used.has(row.gloss)) continue;
      used.add(row.gloss);
      picked.push({
        lemma: row.lemma,
        band: range.band,
        definitionZh: row.gloss,
        pos: (row.pos || "").split(":")[0],
        freqRank: row.freqRank,
      });
    }
    out.push(...picked);
    console.log(`  第 ${range.band} 段 ${range.from}–${range.to}：${picked.length} 个（候选 ${pool.length}）`);
  }

  return out;
}

/** 流式读 ECDICT，只留下能进题库的字段 */
export async function loadEcdictRows() {
  const rows = [];
  const seen = new Set();
  const stream = createReadStream(join(ECDICT_DIR, "ecdict.csv"), "utf8").pipe(
    parseCsv({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
  );
  for await (const row of stream) {
    const rawWord = (row.word ?? "").trim();
    if (!rawWord) continue;
    const lemma = rawWord.toLowerCase();
    if (seen.has(lemma)) continue;
    const freqRank = Number.parseInt(row.frq ?? "0", 10) || 0;
    if (!freqRank) continue;
    seen.add(lemma);
    rows.push({
      lemma,
      translation: row.translation ?? "",
      phonetic: (row.phonetic ?? "").trim(),
      pos: (row.pos ?? "").trim(),
      freqRank,
      // ECDICT 里专有名词首字母大写，如 China / Holmes
      properNoun: /^[A-Z]/.test(rawWord),
    });
  }
  return rows;
}

export async function writeLevelItems(outPath = join(DIST_DIR, "level-items.json")) {
  console.log("· 生成测评题库 …");
  const rows = await loadEcdictRows();
  const items = selectLevelItems(rows);
  await writeFile(outPath, JSON.stringify(items), "utf8");
  console.log(`· 写出 ${items.length} 道测评题 → ${outPath}`);
  return items;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeLevelItems();
}
