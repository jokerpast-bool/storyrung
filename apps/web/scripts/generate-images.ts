/**
 * 用 Agnes 批量生成书封和章节插图。
 *
 * 用法（在 apps/web 下）：
 *   npm run images -- --covers                 只生成可读书目（pass + challenge）的书封
 *   npm run images -- --covers --all           连"需改写"的书也生成
 *   npm run images -- --book the-wonderful-wizard-of-oz --limit 3
 *   npm run images -- --chapter the-wonderful-wizard-of-oz 1
 *   npm run images -- --covers --force         覆盖已有图
 *
 * key 从 ~/.dsh/secrets/agnes.key 读取（或 AGNES_API_KEY_FILE 指定的文件），
 * 不会出现在代码、命令行参数或日志里。
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgnesError, agnesKeyFile, generateImage } from "../lib/agnes";
import {
  chapterFilePath,
  coverFilePath,
  coverPrompt,
  excerptFrom,
  illustrationPrompt,
} from "../lib/generated-art";

// 让 GENERATED_ROOT（process.cwd()/public/generated）永远指向 apps/web
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

interface ChapterJson {
  index: number;
  title: string;
  sentences?: Array<{ text: string }>;
}

interface BookJson {
  slug: string;
  title: string;
  author: string;
  admission: string;
  chapters: ChapterJson[];
}

interface Options {
  mode: "covers" | "book" | "chapter" | "none";
  target?: string;
  chapterIndex?: number;
  limit: number;
  intervalMs: number;
  force: boolean;
  all: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mode: "none",
    limit: Number.POSITIVE_INFINITY,
    intervalMs: 2600,
    force: false,
    all: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--covers") options.mode = "covers";
    else if (arg === "--book") {
      options.mode = "book";
      options.target = argv[++i];
    } else if (arg === "--chapter") {
      options.mode = "chapter";
      options.target = argv[++i];
      options.chapterIndex = Number(argv[++i]);
    } else if (arg === "--limit") options.limit = Number(argv[++i]) || options.limit;
    else if (arg === "--interval") options.intervalMs = Number(argv[++i]) || options.intervalMs;
    else if (arg === "--force") options.force = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--help" || arg === "-h") options.mode = "none";
  }

  return options;
}

async function loadBooks(): Promise<BookJson[]> {
  const file = path.resolve(process.cwd(), "..", "..", "data", "dist", "books.json");
  try {
    return JSON.parse(await readFile(file, "utf8")) as BookJson[];
  } catch {
    throw new Error(`读不到 ${file}，先跑一次内容管线（content-pipeline/build.mjs）。`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

async function save(file: string, bytes: Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

function usage() {
  console.log(`用法：
  npm run images -- --covers [--all] [--limit N] [--force]
  npm run images -- --book <slug> [--limit N] [--force]
  npm run images -- --chapter <slug> <index> [--force]

key 文件：${agnesKeyFile()}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "none") return usage();

  const books = await loadBooks();
  const admitted = books.filter((book) => book.admission === "pass" || book.admission === "challenge");
  const pool = options.all ? books : admitted;

  if (options.mode === "covers") {
    const targets = pool.slice(0, Number.isFinite(options.limit) ? options.limit : undefined);
    console.log(`生成书封：${targets.length} 本（${options.all ? "全部" : "推荐 + 挑战"}）`);
    let done = 0;
    let skipped = 0;
    const startedAt = Date.now();

    for (const [i, book] of targets.entries()) {
      const file = coverFilePath(book.slug);
      if (!options.force && (await exists(file))) {
        skipped += 1;
        console.log(`  · [${i + 1}/${targets.length}] 跳过（已有）${book.slug}`);
        continue;
      }
      process.stdout.write(`  · [${i + 1}/${targets.length}] ${book.title} … `);
      try {
        const image = await generateImage({
          prompt: coverPrompt(book),
          size: "1K",
          ratio: "3:4",
        });
        await save(file, image.bytes);
        done += 1;
        console.log(`ok ${kb(image.bytes.length)}`);
      } catch (error) {
        if (error instanceof AgnesError && (error.code === "missing-key" || error.code === "bad-key")) throw error;
        console.log(`失败：${(error as Error).message}`);
      }
      if (i < targets.length - 1) await sleep(options.intervalMs);
    }

    console.log(`\n完成：生成 ${done} 张，跳过 ${skipped} 张，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`);
    console.log(`输出目录：${path.resolve("public", "generated", "covers")}`);
    return;
  }

  const book = books.find((item) => item.slug === options.target);
  if (!book) throw new Error(`书单里没有 slug：${options.target}`);

  if (options.mode === "chapter") {
    const chapter = book.chapters.find((item) => item.index === options.chapterIndex);
    if (!chapter) throw new Error(`${book.title} 没有第 ${options.chapterIndex} 章`);
    const file = chapterFilePath(book.slug, chapter.index);
    if (!options.force && (await exists(file))) {
      console.log(`已有插图，跳过：${file}`);
      return;
    }
    process.stdout.write(`生成插图：《${book.title}》第 ${chapter.index} 章「${chapter.title}」… `);
    const image = await generateImage({
      prompt: illustrationPrompt(book, { title: chapter.title, excerpt: excerptFrom(chapter.sentences ?? []) }),
      size: "1K",
      ratio: "16:9",
    });
    await save(file, image.bytes);
    console.log(`ok ${kb(image.bytes.length)} → ${file}`);
    return;
  }

  const chapters = book.chapters.slice(0, Number.isFinite(options.limit) ? options.limit : undefined);
  console.log(`生成插图：《${book.title}》${chapters.length} 章`);
  let done = 0;
  let skipped = 0;
  const startedAt = Date.now();

  for (const [i, chapter] of chapters.entries()) {
    const file = chapterFilePath(book.slug, chapter.index);
    if (!options.force && (await exists(file))) {
      skipped += 1;
      console.log(`  · [${i + 1}/${chapters.length}] 跳过（已有）第 ${chapter.index} 章`);
      continue;
    }
    process.stdout.write(`  · [${i + 1}/${chapters.length}] 第 ${chapter.index} 章「${chapter.title}」… `);
    try {
      const image = await generateImage({
        prompt: illustrationPrompt(book, { title: chapter.title, excerpt: excerptFrom(chapter.sentences ?? []) }),
        size: "1K",
        ratio: "16:9",
      });
      await save(file, image.bytes);
      done += 1;
      console.log(`ok ${kb(image.bytes.length)}`);
    } catch (error) {
      if (error instanceof AgnesError && (error.code === "missing-key" || error.code === "bad-key")) throw error;
      console.log(`失败：${(error as Error).message}`);
    }
    if (i < chapters.length - 1) await sleep(options.intervalMs);
  }

  console.log(`\n完成：生成 ${done} 张，跳过 ${skipped} 张，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
