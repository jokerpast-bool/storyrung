#!/usr/bin/env node
/**
 * 改写管线：把未过闸（admission=fail）的公版书，按目标等级改写成"简写版"。
 *
 * 用法：
 *   node content-pipeline/adapt.mjs --assign                    # 把 82 本 fail 书按覆盖率分配档位（30% 四级 / 40% 六级 / 30% 托福）
 *   node content-pipeline/adapt.mjs --book <slug> --tier cet4   # 改写一本（逐章缓存，中断可续）
 *   node content-pipeline/adapt.mjs --tier cet4 --limit 3       # 按 plan 顺序批量改写
 *
 * 产物：
 *   data/adapted/plan.json                 档位分配
 *   data/adapted/<tier>/<slug>.json        逐章改写缓存 + 前后覆盖率
 *   data/adapted/<tier>/<slug>.txt         合并后的新书（CHAPTER n. 标题 分章，可直接被 build.mjs 消费）
 *
 * 改写策略：
 *   1) 只重写"需要重写"的段落 —— 段落里若没有超出目标词汇量的词，原样保留（保住文风，也省钱）。
 *   2) 需要重写的段落按 ~1000 词分组，一次调用改一组；要求保留人名地名、段落结构、全部情节。
 *   3) 每组改完立即用同一套 COCA 词频重算覆盖率，不达标就带着"剩余难词清单"再改一次（最多 2 次）。
 *   4) 每章结果落盘，中断后重跑会跳过已完成章节。
 *
 * 网关与 key：与 apps/web/lib/agnes.ts 一致（国内站 https://api.agnes-ai.cn/v1）。
 * key 从 AGNES_API_KEY_FILE 或 C:\Users\Lenovo\.dsh\secrets\agnes.key 读取，不写进代码。
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseCsv } from "csv-parse";
import { expandLongChapters, paragraphs, splitChapters, stripGutenberg, toSentences, tokenize } from "./lib/text.mjs";

const ROOT = process.cwd();
const ECDICT_DIR = join(ROOT, "node_modules", "ecdict", "assets");
const DIST = join(ROOT, "data", "dist");
const BOOK_DIR = join(ROOT, "data", "books");
const OUT_DIR = join(ROOT, "data", "adapted");

/**
 * 文本改写走 DeepSeek（本地 DSH 已配置 key，按 token 计费便宜、吞吐高）；
 * 生图/视频仍归 Agnes（见 apps/web/lib/agnes.ts）。可用 ADAPT_PROVIDER 切回 agnes。
 */
const PROVIDER = (process.env.ADAPT_PROVIDER ?? "deepseek").toLowerCase();
const PROVIDERS = {
  deepseek: {
    base: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
  },
  agnes: {
    base: process.env.AGNES_BASE_URL ?? "https://api.agnes-ai.cn/v1",
    model: process.env.AGNES_CHAT_MODEL ?? "agnes-3.0-flash",
  },
};
const ACTIVE = PROVIDERS[PROVIDER] ?? PROVIDERS.agnes;
const CREDENTIALS_FILE = join(process.env.USERPROFILE ?? "", ".dsh", ".credentials.yaml");
const KEY_FILE = process.env.AGNES_API_KEY_FILE ?? join(process.env.USERPROFILE ?? "", ".dsh", "secrets", "agnes.key");

/** 30% 四级 / 40% 六级 / 30% 托福：82 本 → 25 / 33 / 24（四舍五入，按覆盖率从易到难分配）。 */
const SPLIT = [
  { tier: "cet4", ratio: 0.3 },
  { tier: "cet6", ratio: 0.4 },
  { tier: "toefl", ratio: 0.3 },
];

const TIERS = {
  cet4: { rank: 4500, label: "四级", min: 0.94, perSentence: 0.9 },
  cet6: { rank: 6000, label: "六级", min: 0.965, perSentence: 0.7 },
  toefl: { rank: 8000, label: "托福", min: 0.975, perSentence: 0.6 },
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);

async function readKey() {
  if (PROVIDER === "deepseek") {
    if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
    const raw = await readFile(CREDENTIALS_FILE, "utf8");
    const match = raw.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(\S+)\s*$/m);
    if (!match) throw new Error(`找不到 DEEPSEEK_API_KEY：${CREDENTIALS_FILE}`);
    return match[1];
  }
  if (process.env.AGNES_AI_API_KEY) return process.env.AGNES_AI_API_KEY.trim();
  let raw;
  try {
    raw = await readFile(KEY_FILE, "utf8");
  } catch {
    throw new Error(`找不到 Agnes key 文件：${KEY_FILE}`);
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const key = lines.at(-1);
  if (!key) throw new Error(`Agnes key 文件是空的：${KEY_FILE}`);
  return key;
}

async function chat(messages, { maxTokens = 4096, temperature = 0.2, attempt = 0 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${ACTIVE.base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model: ACTIVE.model, messages, max_tokens: maxTokens, temperature }),
    });
    const text = await response.text();
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        return chat(messages, { maxTokens, temperature, attempt: attempt + 1 });
      }
      throw new Error(`chat ${response.status}: ${text.slice(0, 300)}`);
    }
    const payload = JSON.parse(text);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error(`chat 返回为空：${text.slice(0, 200)}`);
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function loadInflections() {
  const raw = await readFile(join(ECDICT_DIR, "lemma.en.txt"), "utf8");
  const map = new Map();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    const [left, right] = trimmed.split("->");
    if (!left || !right) continue;
    const base = left.split("/")[0]?.trim().toLowerCase();
    if (!base) continue;
    for (const form of right.split(",")) {
      const inflected = form.trim().toLowerCase();
      if (!inflected) continue;
      const bucket = map.get(inflected);
      if (bucket) {
        if (!bucket.includes(base)) bucket.push(base);
      } else {
        map.set(inflected, [base]);
      }
    }
  }
  return map;
}

async function loadRankDict() {
  const dict = new Map();
  const stream = createReadStream(join(ECDICT_DIR, "ecdict.csv"), "utf8").pipe(
    parseCsv({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
  );
  for await (const row of stream) {
    const word = (row.word ?? "").trim().toLowerCase();
    if (!word) continue;
    const rank = Number.parseInt(row.frq ?? "0", 10) || 0;
    if (rank > 0) dict.set(word, rank);
  }
  return dict;
}

/** 词频排名的单一量纲：COCA 排名优先，缺失按 30000（罕见）。 */
function makeRanker(dict, inflect) {
  const lemmaOf = (surface) => {
    const lower = surface.toLowerCase();
    const bucket = inflect.get(lower);
    return bucket && bucket.length > 0 ? bucket[0] : lower;
  };
  const rankOf = (lemma) => {
    const rank = dict.get(lemma);
    return rank && rank > 0 ? rank : 30000;
  };
  return { lemmaOf, rankOf };
}

/**
 * 统计一段文本在目标词表下的可读性。
 * 专有名词（句中大写、且不在句首）不计入生词——和人名地名较劲没有意义。
 */
function measure(text, ranker, vocab) {
  const sentences = toSentences(text);
  // 专有名词判定：同一个词在本段里 >=80% 的次数是大写，就当人名/地名，整段都不算生词。
  // 只按"句中大写"判会漏掉句首的 Tom / Moppet，那会把覆盖率算低 5~8 个点。
  const caps = new Map();
  for (const sentence of sentences) {
    for (const token of tokenize(sentence.text)) {
      const stats = caps.get(token.surface.toLowerCase()) ?? { total: 0, cap: 0 };
      stats.total += 1;
      if (/^[A-Z]/.test(token.surface)) stats.cap += 1;
      caps.set(token.surface.toLowerCase(), stats);
    }
  }
  const names = new Set(
    [...caps.entries()].filter(([, s]) => s.total >= 1 && s.cap / s.total >= 0.8).map(([word]) => word),
  );

  let tokens = 0;
  let unknown = 0;
  const hard = new Map();
  for (const sentence of sentences) {
    tokenize(sentence.text).forEach((token) => {
      const lower = token.surface.toLowerCase();
      if (names.has(lower)) return;
      tokens += 1;
      const lemma = ranker.lemmaOf(token.surface);
      if (ranker.rankOf(lemma) > vocab) {
        unknown += 1;
        hard.set(lemma, (hard.get(lemma) ?? 0) + 1);
      }
    });
  }
  return {
    coverage: tokens === 0 ? 1 : (tokens - unknown) / tokens,
    sentences: sentences.length,
    unknownPerSentence: sentences.length === 0 ? 0 : unknown / sentences.length,
    hard: [...hard.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function chunkParagraphs(paras, maxWords = 1000) {
  const chunks = [];
  let buffer = [];
  let words = 0;
  for (const para of paras) {
    const n = para.split(/\s+/).length;
    if (buffer.length > 0 && words + n > maxWords) {
      chunks.push(buffer);
      buffer = [];
      words = 0;
    }
    buffer.push(para);
    words += n;
  }
  if (buffer.length > 0) chunks.push(buffer);
  return chunks;
}

/** 并发受限的 map：改写是网络 IO 密集型，串行跑 330 万字要几十小时。 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

function promptFor(tier, chunkText, hardWords) {
  const t = TIERS[tier];
  const rules = [
    `Rewrite the passage for a Chinese learner who knows about ${t.rank} of the most common English words.`,
    "Rules:",
    "1. Keep the story exactly the same: same events, same characters, same order, same meaning.",
    "2. Keep every person name, place name and title exactly as written.",
    "3. Keep the same number of paragraphs and the same paragraph order. Separate paragraphs with a blank line.",
    "4. Replace rare, archaic or literary words with common everyday words a learner knows.",
    "5. Split long winding sentences into shorter ones (average under 20 words).",
    "6. Write in simple past tense narration; keep the dialogue natural.",
    "7. Do not add explanations, notes, headings, or a summary. Output ONLY the rewritten passage.",
  ];
  if (hardWords.length > 0) {
    rules.push(
      `8. Do NOT use any of these rare words (replace each with a common word, or rephrase): ${hardWords.slice(0, 40).join(", ")}.`,
    );
  }
  return `${rules.join("\n")}\n\nPASSAGE:\n${chunkText}`;
}

// measure() 与 build.mjs 的入库判定在分词/标点/词典覆盖上仍有零点几到一点几的差异：
// 按自身下限刚好停的书，入库时经常差 0.1~0.3pp。多要 1.2pp 覆盖率，句均生词再紧 15%。
const HEADROOM = 0.012;

async function rewriteChunk(chunkText, tier, ranker) {
  const t = TIERS[tier];
  const targetCoverage = t.min + HEADROOM;
  const targetPerSentence = t.perSentence * 0.85;
  const source = measure(chunkText, ranker, t.rank);
  const seed = source.hard.slice(0, 40).map(([lemma]) => lemma);
  let text = await chat([
    { role: "system", content: "You are a careful editor who adapts classic English literature into graded readers." },
    { role: "user", content: promptFor(tier, chunkText, seed) },
  ]);
  let stats = measure(text, ranker, t.rank);

  // 最多再改 4 轮：每轮把"上一稿里仍然超纲的词"原样喂回去，要求全部换掉。
  for (let round = 0; round < 4; round += 1) {
    if (stats.coverage >= targetCoverage && stats.unknownPerSentence <= targetPerSentence) break;
    const hard = stats.hard.slice(0, 40).map(([lemma]) => lemma);
    if (hard.length === 0) break;
    const retry = await chat([
      { role: "system", content: "You are a careful editor who adapts classic English literature into graded readers." },
      { role: "user", content: promptFor(tier, text, hard) },
    ]);
    const next = measure(retry, ranker, t.rank);
    if (next.coverage <= stats.coverage && next.unknownPerSentence >= stats.unknownPerSentence) break; // 没变好就停
    text = retry;
    stats = next;
  }
  return { text, stats };
}

// 少数书的前置内容（书名页、目录、序言、学术史）比正文还难，模型改不动也没必要改：
// 手工标出正文起点，之前的全部丢弃。只影响这里列出的书。
const FRONT_MATTER_CUT = {
  "the-fables-of-aesop": "Aesop’s Fables",
};

function cutFrontMatter(slug, raw) {
  const marker = FRONT_MATTER_CUT[slug];
  if (!marker) return raw;
  const at = raw.indexOf(marker, 5000);
  return at > 0 ? raw.slice(at) : raw;
}

// 没有独立章节标题的书，splitChapters 会把正文第一行当标题（"At the little town of
// Vevey, in Switzerland, there is a particularly（2）"），读起来像残句。这类改成 Part n。
function cleanTitle(title, index) {
  const t = (title || "").replace(/\s+/g, " ").trim();
  if (!t) return `Part ${index}`;
  if (t.length > 60 || t.split(/\s+/).length > 10) return `Part ${index}`;
  return t;
}

async function adaptBook(slug, tier, options = {}) {
  const t = TIERS[tier];
  const cachePath = join(OUT_DIR, tier, `${slug}.json`);
  let cache = { slug, tier, chapters: {} };
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    // 首次跑
  }

  const raw = await readFile(join(BOOK_DIR, `${slug}.txt`), "utf8");
  const chapters = expandLongChapters(splitChapters(stripGutenberg(cutFrontMatter(slug, raw))));
  const limit = options.chapters ?? chapters.length;
  const slice = chapters.slice(0, limit);

  const inflect = await loadInflections();
  const dict = await loadRankDict();
  const ranker = makeRanker(dict, inflect);

  const results = [];
  for (const chapter of slice) {
    const key = String(chapter.index);
    const before = measure(chapter.body, ranker, t.rank);
    const cached = cache.chapters?.[key];
    // --topup 只补跑"缓存里低于本档下限"的章节（拖后腿的那几章），已达标的章节不动，避免整本重烧。
    const needsTopUp = Boolean(options.topup) && cached && cached.coverageAfter < t.min;
    if (cached && !options.force && !needsTopUp) {
      results.push({ ...cached, cached: true });
      console.log(`  ${slug} ch${key} 已缓存（覆盖率 ${(cached.coverageAfter * 100).toFixed(1)}%）`);
      continue;
    }

    const sourceBody = needsTopUp && cached?.text ? cached.text : chapter.body;
    const paras = paragraphs(sourceBody);
    const chunks = chunkParagraphs(paras, options.chunkWords ?? 1200);
    const rewritten = await mapLimit(chunks, options.concurrency ?? 4, async (chunk) => {
      // 整块没有超出词表的词，就原样保留：省一次调用，也保住原文节奏
      const chunkText = chunk.join("\n\n");
      const quick = measure(chunkText, ranker, t.rank);
      const hardCount = quick.hard.reduce((acc, [, n]) => acc + n, 0);
      if (hardCount <= 1 && quick.coverage >= 0.995) return chunkText;
      const { text } = await rewriteChunk(chunkText, tier, ranker);
      return text;
    });

    const text = rewritten.join("\n\n");
    const after = measure(text, ranker, t.rank);
    const words = text.split(/\s+/).length;
    const record = {
      title: chapter.title,
      text,
      coverageBefore: before.coverage,
      coverageAfter: after.coverage,
      unknownPerSentence: after.unknownPerSentence,
      words,
    };
    cache.chapters[key] = record;
    results.push(record);
    await mkdir(join(OUT_DIR, tier), { recursive: true });
    await writeFile(cachePath, JSON.stringify(cache), "utf8");
    console.log(
      `  ${slug} ch${key} ${before.coverage * 100}% → ${after.coverage * 100}% · ${words} 词 · ${after.unknownPerSentence.toFixed(2)} 生词/句`,
    );
  }

  // 合并成一本新书：章节标记与 build.mjs 的 splitChapters 对齐
  const body = results
    .map((r, i) => `CHAPTER ${i + 1}. ${cleanTitle(r.title, i + 1)}\n\n${r.text}`)
    .join("\n\n");
  await writeFile(join(OUT_DIR, tier, `${slug}.txt`), body, "utf8");
  // 元数据：build.mjs 靠 complete 判断"这本是否已全本改写完"，没改完就不能拿去替换原文。
  await writeFile(
    join(OUT_DIR, tier, `${slug}.meta.json`),
    JSON.stringify(
      {
        slug,
        tier,
        chapters: results.length,
        totalChapters: chapters.length,
        complete: results.length >= chapters.length,
      },
      null,
      2,
    ),
    "utf8",
  );
  return results;
}

async function assign() {
  const books = JSON.parse(await readFile(join(DIST, "books.json"), "utf8"));
  const failBooks = books.filter((b) => b.admission === "fail");
  // 短书的覆盖率样本太小（800 词的绘本会因为几个人名判成 85%），先按"童书/绘本"归到四级档，
  // 其余再按覆盖率从易到难排：越接近 94% 的改写量越小，放四级；最难的长篇放托福档。
  const small = failBooks.filter((b) => (b.wordCount ?? Number.MAX_SAFE_INTEGER) < 6000);
  const rest = failBooks
    .filter((b) => !small.includes(b))
    .sort((a, b) => (b.gateCoverage ?? 0) - (a.gateCoverage ?? 0));
  const fail = [...small, ...rest];
  const total = fail.length;
  const plan = [];
  let cursor = 0;
  let allocated = 0;
  for (const { tier, ratio } of SPLIT) {
    const count = tier === SPLIT.at(-1).tier ? total - allocated : Math.round(total * ratio);
    for (const book of fail.slice(cursor, cursor + count)) {
      plan.push({ slug: book.slug, title: book.title, author: book.author, coverage: book.gateCoverage, wordCount: book.wordCount, tier });
    }
    cursor += count;
    allocated += count;
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
  const counts = plan.reduce((acc, p) => ((acc[p.tier] = (acc[p.tier] ?? 0) + 1), acc), {});
  console.log(`已分配 ${plan.length} 本：${JSON.stringify(counts)}`);
  for (const tier of Object.keys(TIERS)) {
    const rows = plan.filter((p) => p.tier === tier);
    console.log(`  ${TIERS[tier].label} ${rows.length} 本 · 词数 ${rows.reduce((a, b) => a + (b.wordCount ?? 0), 0).toLocaleString()}`);
  }
}

async function main() {
  if (has("assign")) return assign();

  const tier = flag("tier");
  if (!tier || !TIERS[tier]) throw new Error("--tier 必须是 cet4 / cet6 / toefl");

  const booksFlag = flag("book");
  let targets;
  if (booksFlag) {
    targets = booksFlag.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    const plan = JSON.parse(await readFile(join(OUT_DIR, "plan.json"), "utf8"));
    targets = plan.filter((p) => p.tier === tier).map((p) => p.slug);
    const limit = Number(flag("limit") ?? targets.length);
    targets = targets.slice(0, limit);
  }

  let spent = 0;
  const started = Date.now();
  for (const slug of targets) {
    await stat(join(BOOK_DIR, `${slug}.txt`)).catch(() => {
      throw new Error(`缺少原文缓存 data/books/${slug}.txt，先跑 build.mjs 下载`);
    });
    const results = await adaptBook(slug, tier, {
      chapters: flag("chapters") ? Number(flag("chapters")) : undefined,
      force: has("force"),
      topup: has("topup"),
      concurrency: Number(flag("concurrency") ?? 4),
      chunkWords: Number(flag("chunk-words") ?? 1200),
    });
    const avgBefore = results.reduce((a, r) => a + r.coverageBefore, 0) / results.length;
    const avgAfter = results.reduce((a, r) => a + r.coverageAfter, 0) / results.length;
    console.log(`✓ ${slug}: ${(avgBefore * 100).toFixed(1)}% → ${(avgAfter * 100).toFixed(1)}%`);
    spent += 1;
  }
  console.log(`完成 ${spent} 本，用时 ${Math.round((Date.now() - started) / 1000)}s`);
}

const KEY = has("assign") ? "" : await readKey();
main().catch((error) => {
  console.error("adapt 失败：", error.message);
  process.exitCode = 1;
});
