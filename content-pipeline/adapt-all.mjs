/**
 * 批量改写：按 plan.json 的三档分配，逐本调用 adapt.mjs。
 *
 * 为什么要"一本一进程"：adapt.mjs 单个进程里只要有一本失败就会整体退出，
 * 而 74 本书跑几个小时，中间任何一次网络抖动都不该让整批白跑。
 * 每章的缓存写在 data/adapted/{tier}/{slug}.json，进程重启会自动跳过已完成章节，
 * 所以这个脚本可以随时杀掉重跑，代价只有加载词典的几秒。
 *
 * 用法：node content-pipeline/adapt-all.mjs [--tier cet4|cet6|toefl] [--limit N] [--dry]
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TIERS = ["cet4", "cet6", "toefl"];

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const plan = JSON.parse(readFileSync(join(ROOT, "data", "adapted", "plan.json"), "utf8"));
const books = plan.books ?? plan;

const done = new Set();
for (const tier of TIERS) {
  const dir = join(ROOT, "data", "adapted", tier);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".txt")) done.add(name.slice(0, -4));
  }
}

const tierFilter = arg("tier");
const limit = Number.parseInt(arg("limit", "0"), 10) || 0;

let queue = books
  .filter((b) => !done.has(b.slug))
  .filter((b) => !tierFilter || b.tier === tierFilter)
  .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.wordCount - b.wordCount);

if (limit > 0) queue = queue.slice(0, limit);

if (queue.length === 0) {
  console.log("· 没有待改写的书（全部已有 data/adapted/*/*.txt）");
  process.exit(0);
}

console.log(`· 待改写 ${queue.length} 本，合计 ${queue.reduce((s, b) => s + b.wordCount, 0).toLocaleString()} 词`);
if (has("dry")) {
  for (const b of queue) console.log(`  ${b.tier.padEnd(6)} ${String(b.wordCount).padStart(7)}  ${b.slug}`);
  process.exit(0);
}

const run = (slug, tier) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["content-pipeline/adapt.mjs", "--tier", tier, "--book", slug, "--concurrency", "6"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code === 0));
  });

let ok = 0;
let failed = [];
const startedAt = Date.now();

for (const book of queue) {
  const t0 = Date.now();
  const passed = await run(book.slug, book.tier);
  const secs = Math.round((Date.now() - t0) / 1000);
  if (passed) {
    ok += 1;
    console.log(`✓ ${book.slug} (${book.tier}) ${secs}s · ${ok}/${queue.length}`);
  } else {
    failed.push(book.slug);
    console.log(`✗ ${book.slug} (${book.tier}) ${secs}s 失败，继续下一本`);
  }
}

const mins = Math.round((Date.now() - startedAt) / 60000);
console.log(`\n完成 ${ok}/${queue.length}，失败 ${failed.length}，用时 ${mins} 分钟`);
if (failed.length) console.log(`失败：${failed.join(", ")}`);
