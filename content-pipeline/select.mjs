#!/usr/bin/env node
/**
 * 批量选书：候选书名 → 从 Gutenberg 官方目录（data/catalog/pg_catalog.csv）解析出书籍 ID。
 *
 * 为什么不手写 ID：ID 记错就下错书、而且看起来"跑通了"。目录是官方机器可读清单，
 * 按书名 + 作者匹配，匹配不上的候选直接报出来，宁可少一本也不要错一本。
 *
 * 输入：data/catalog/pg_catalog.csv（缺失时自动下载，支持断点续传）
 *       content-pipeline/candidates.json
 * 输出：content-pipeline/books.json（build.mjs 的输入）
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { parse as parseCsv } from "csv-parse";

const ROOT = process.cwd();
const CATALOG = join(ROOT, "data", "catalog", "pg_catalog.csv");
const CANDIDATES = join(ROOT, "content-pipeline", "candidates.json");
const OUT = join(ROOT, "content-pipeline", "books.json");
const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function ensureCatalog() {
  await mkdir(join(ROOT, "data", "catalog"), { recursive: true });
  const MIN_BYTES = 20 * 1024 * 1024;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const have = await fileSize(CATALOG);
    if (have >= MIN_BYTES) return;
    try {
      const response = await fetch(CATALOG_URL, {
        headers: {
          "user-agent": "english-reading-mvp/0.1",
          ...(have > 0 ? { range: `bytes=${have}-` } : {}),
        },
      });
      if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
      const resumed = response.status === 206;
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(CATALOG, { flags: resumed ? "a" : "w" }),
      );
      console.log(`  · 目录下载${resumed ? "续传" : "完成"}：${((await fileSize(CATALOG)) / 1024 / 1024).toFixed(1)} MB`);
    } catch (error) {
      console.log(`  · 目录下载第 ${attempt} 次失败：${error.message}`);
    }
  }
}

/** 归一化书名：去掉冠词、标点、副标题、大小写差异。 */
function normalizeTitle(title) {
  return title
    .split("\n")[0] // 目录里副标题常写在第二行（\r\n 分隔），只取主标题
    .toLowerCase()
    .split(/[:;(]|, or the |, and selected|, complete|, part \d/)[0]
    .replace(/['’"“”]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const EMOJI_BY_HINT = [
  [/alice|looking-glass/i, "🐇"],
  [/wizard of oz/i, "🌪️"],
  [/pride and prejudice|emma|sense and sensibility|mansfield|northanger/i, "💌"],
  [/sherlock|study in scarlet|sign of the four|baskervilles|holmes/i, "🔍"],
  [/time machine|invisible man|war of the worlds/i, "⏳"],
  [/treasure island|kidnapped|jekyll/i, "🏴‍☠️"],
  [/frankenstein|dracula|dorian gray/i, "🕯️"],
  [/gatsby/i, "🥂"],
  [/call of the wild|white fang/i, "🐺"],
  [/jungle book|just so/i, "🐅"],
  [/secret garden|little princess|fauntleroy|little women|anne of green|railway children/i, "🌿"],
  [/peter pan|wind in the willows|black beauty|velveteen/i, "🍃"],
  [/grimm|andersen|aesop|fairy|pinocchio/i, "🧚"],
  [/musketeers|monte cristo|eighty days|center of the earth|leagues/i, "🗺️"],
  [/pimpernel|zenda|thirty-nine steps|riddle of the sands|solomon|she\b/i, "🎩"],
  [/scarlet letter|red badge|jane eyre|wuthering|moby/i, "📖"],
];

function emojiFor(title) {
  for (const [pattern, emoji] of EMOJI_BY_HINT) if (pattern.test(title)) return emoji;
  return "📘";
}

/** 目录里的作者字段形如 "Doyle, Arthur Conan, 1859-1930; 另一位"：掐掉年份与括注，只留第一作者。 */
function cleanAuthor(raw) {
  const first = (raw ?? "").split(";")[0];
  return first
    .replace(/\([^)]*\)/g, " ")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^\d{4}(-\d{4})?$/.test(part))
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 目录标题常带副标题与全小写，截断到适合 UI 的长度。 */
function cleanTitle(raw) {
  const title = (raw ?? "").split("\n")[0].replace(/\s+/g, " ").trim();
  return title.length > 72 ? `${title.slice(0, 70)}…` : title;
}

async function main() {
  console.log("· 准备 Gutenberg 目录 …");
  await ensureCatalog();

  const candidates = JSON.parse(await readFile(CANDIDATES, "utf8"));
  console.log(`· 候选 ${candidates.length} 本，扫描目录 …`);

  const byTitle = new Map();
  const stream = createReadStream(CATALOG, "utf8").pipe(
    parseCsv({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
  );

  for await (const row of stream) {
    if (row.Type !== "Text") continue;
    if (row.Language !== "en") continue;
    const id = Number.parseInt(row["Text#"] ?? "", 10);
    if (!Number.isFinite(id)) continue;
    const key = normalizeTitle(row.Title ?? "");
    if (!key) continue;
    const entry = {
      id,
      title: (row.Title ?? "").replace(/\s+/g, " ").trim(),
      author: (row.Authors ?? "").replace(/\s+/g, " ").trim(),
      issued: row.Issued ?? "",
    };
    const list = byTitle.get(key);
    if (list) list.push(entry);
    else byTitle.set(key, [entry]);
  }

  const picked = [];
  const missed = [];
  for (const candidate of candidates) {
    const key = normalizeTitle(candidate.title);
    const list = byTitle.get(key) ?? [];
    const authorHint = (candidate.authorHint ?? "").toLowerCase();
    const match = list.find((entry) => !authorHint || entry.author.toLowerCase().includes(authorHint));
    if (!match) {
      missed.push(candidate.title);
      continue;
    }
    // 显示名与 slug 用候选里的干净书名；目录标题常带一长串副标题（"Ozma of Oz A Record of Her..."）
    picked.push({
      gutenbergId: match.id,
      slug: slugify(candidate.title),
      title: candidate.title,
      author: cleanAuthor(match.author) || candidate.authorHint || "Unknown",
      emoji: emojiFor(candidate.title),
      description:
        candidate.description ??
        `${cleanAuthor(match.author)} · Project Gutenberg #${match.id}（${match.issued.slice(0, 4)}）。难度与是否可读由管线实测判定。`,
    });
  }

  // 同一本书可能被多个候选命中（不同书名的同一版），按 ID 去重
  const deduped = [...new Map(picked.map((book) => [book.gutenbergId, book])).values()];
  await writeFile(OUT, `${JSON.stringify(deduped, null, 2)}\n`, "utf8");

  console.log(`· 命中 ${deduped.length} 本 → content-pipeline/books.json`);
  if (missed.length > 0) {
    console.log(`· 未命中 ${missed.length} 本（书名与目录不一致，已跳过）：`);
    for (const title of missed) console.log(`    - ${title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
