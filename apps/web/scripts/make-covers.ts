/**
 * 批量生成水彩书封（第 4 款风格）。
 *
 * 用法（在 apps/web 下）：
 *   npm run covers                为还没有封面的书生成（109 本里跳过已有的）
 *   npm run covers -- --force     全部重画
 *   npm run covers -- --slug the-wonderful-wizard-of-oz --force
 *   npm run covers -- --limit 10 --concurrency 3
 *
 * 每本先用 DeepSeek 写一句画面描述（缓存在 data/covers/briefs.json），
 * 再交给 Agnes 出 864×1152 的水彩封面。
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgnesError, generateImage } from "../lib/agnes";
import { coverFilePath, coverPrompt, excerptFrom } from "../lib/generated-art";
import { deepSeekBrief, loadBriefs, manualBrief, saveBriefs, type BriefMap } from "../lib/visual-brief";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

interface BookJson {
  slug: string;
  title: string;
  author: string;
  chapters: Array<{ index: number; sentences?: Array<{ text: string }> }>;
}

interface Options {
  slug?: string;
  limit: number;
  force: boolean;
  concurrency: number;
  intervalMs: number;
}

function parseArgs(argv: string[]): Options {
  const out: Options = { limit: Number.POSITIVE_INFINITY, force: false, concurrency: 2, intervalMs: 800 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slug") out.slug = argv[++i];
    else if (arg === "--limit") out.limit = Number(argv[++i]) || out.limit;
    else if (arg === "--force") out.force = true;
    else if (arg === "--concurrency") out.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === "--interval") out.intervalMs = Number(argv[++i]) || out.intervalMs;
  }
  return out;
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

/** 没有章节数据的书（未过闸）退回原文开头，作为画面参考。 */
async function rawExcerpt(slug: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.resolve(process.cwd(), "..", "..", "data", "books", `${slug}.txt`), "utf8");
    const start = raw.indexOf("*** START");
    let body = start >= 0 ? raw.slice(raw.indexOf("\n", start) + 1) : raw;
    const end = body.indexOf("*** END");
    if (end > 0) body = body.slice(0, end);
    const chapter = body.search(/\n\s*(CHAPTER|Chapter|PART|BOOK)\b/);
    if (chapter > 0) body = body.slice(chapter);
    return body.replace(/\s+/g, " ").trim().slice(0, 480);
  } catch {
    return undefined;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const books = JSON.parse(
    await readFile(path.resolve(process.cwd(), "..", "..", "data", "dist", "books.json"), "utf8"),
  ) as BookJson[];

  let targets = options.slug ? books.filter((b) => b.slug === options.slug) : books;
  if (!targets.length) throw new Error(`书单里没有 ${options.slug}`);

  if (!options.force) {
    const keep: BookJson[] = [];
    for (const book of targets) {
      if (await exists(coverFilePath(book.slug))) continue;
      keep.push(book);
    }
    targets = keep;
  }
  targets = targets.slice(0, Number.isFinite(options.limit) ? options.limit : undefined);

  console.log(`书封：${targets.length} 本，风格=水彩，并发=${options.concurrency}`);
  if (!targets.length) return;

  const briefs: BriefMap = await loadBriefs();
  let done = 0;
  let failed = 0;
  const startedAt = Date.now();

  let cursor = 0;
  async function worker(id: number) {
    while (cursor < targets.length) {
      const book = targets[cursor++];
      const label = `[${cursor}/${targets.length}] ${book.title}`;

      let brief = manualBrief(book.slug) ?? briefs[book.slug];
      if (!brief) {
        const first = book.chapters[0];
        const excerpt = first?.sentences?.length ? excerptFrom(first.sentences, 500) : await rawExcerpt(book.slug);
        const written = await deepSeekBrief({ title: book.title, author: book.author, excerpt });
        if (written) {
          brief = written;
          briefs[book.slug] = written;
          await saveBriefs(briefs);
        }
      }

      const t0 = Date.now();
      try {
        const image = await generateImage({
          prompt: coverPrompt({ title: book.title, author: book.author }, brief),
          size: "1K",
          ratio: "3:4",
          timeoutMs: 240_000,
        });
        const file = coverFilePath(book.slug);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, image.bytes);
        done += 1;
        console.log(`${label} ok ${Math.round(image.bytes.length / 1024)}KB ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (error) {
        failed += 1;
        if (error instanceof AgnesError && (error.code === "missing-key" || error.code === "bad-key")) throw error;
        console.log(`${label} 失败：${(error as Error).message}`);
      }
      await sleep(options.intervalMs);
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, (_, i) => worker(i)));

  console.log(`完成：成功 ${done}，失败 ${failed}，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`输出目录：${path.resolve("public", "generated", "covers")}`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
