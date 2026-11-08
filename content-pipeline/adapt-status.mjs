/**
 * 改写进度：读 plan.json + data/adapted 目录，按档位统计完成度与剩余量。
 *
 * 用法：node content-pipeline/adapt-status.mjs [--eta 150]
 *   --eta 每秒词数，默认 150（DeepSeek 实测 175 词/秒，留一点余量）
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TIERS = ["cet4", "cet6", "toefl"];
const LABEL = { cet4: "四级", cet6: "六级", toefl: "托福" };

const planPath = join(ROOT, "data", "adapted", "plan.json");
if (!existsSync(planPath)) {
  console.error("找不到 data/adapted/plan.json，先跑 node content-pipeline/adapt.mjs --assign");
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const books = plan.books ?? plan;

const rateArg = process.argv.indexOf("--eta");
const rate = rateArg >= 0 ? Number(process.argv[rateArg + 1]) || 150 : 150;

const state = new Map();
for (const tier of TIERS) {
  const dir = join(ROOT, "data", "adapted", tier);
  const txt = new Set();
  const incomplete = new Set();
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".txt")) txt.add(name.slice(0, -4));
    }
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".meta.json")) continue;
      const slug = name.slice(0, -".meta.json".length);
      try {
        const meta = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (meta.complete === false) incomplete.add(slug);
      } catch {
        incomplete.add(slug);
      }
    }
  }
  state.set(tier, { txt, incomplete });
}

let totalDone = 0;
let totalBooks = 0;
let totalWordsDone = 0;
let totalWords = 0;

console.log("档位    完成         词数完成              进度");
for (const tier of TIERS) {
  const entries = books.filter((b) => b.tier === tier);
  const { txt, incomplete } = state.get(tier);
  const done = entries.filter((b) => txt.has(b.slug));
  const wordsDone = done.reduce((s, b) => s + b.wordCount, 0);
  const words = entries.reduce((s, b) => s + b.wordCount, 0);
  const pct = words ? (wordsDone / words) * 100 : 100;
  totalBooks += entries.length;
  totalDone += done.length;
  totalWords += words;
  totalWordsDone += wordsDone;
  console.log(
    `${LABEL[tier].padEnd(6)} ${String(done.length).padStart(3)}/${String(entries.length).padEnd(4)}  ` +
      `${String(wordsDone).padStart(9)}/${String(words).padStart(9)} 词  ${pct.toFixed(1).padStart(5)}%`,
  );
  if (incomplete.size) {
    const list = [...incomplete].filter((s) => entries.some((b) => b.slug === s));
    if (list.length) console.log(`       未完成（meta.complete=false）：${list.join(", ")}`);
  }
}

const restWords = totalWords - totalWordsDone;
console.log(
  `合计     ${String(totalDone).padStart(3)}/${String(totalBooks).padEnd(4)}  ` +
    `${String(totalWordsDone).padStart(9)}/${String(totalWords).padStart(9)} 词  ` +
    `${((totalWordsDone / totalWords) * 100).toFixed(1)}%`,
);
if (restWords > 0) {
  console.log(`剩余 ${restWords.toLocaleString()} 词，按 ${rate} 词/秒估算约 ${(restWords / rate / 3600).toFixed(1)} 小时`);
}

const pending = books
  .filter((b) => !state.get(b.tier).txt.has(b.slug))
  .sort((a, b) => a.wordCount - b.wordCount);
if (pending.length) {
  console.log("\n待改写（按词数升序，前 10）：");
  for (const b of pending.slice(0, 10)) {
    console.log(`  ${LABEL[b.tier]}  ${String(b.wordCount).padStart(7)} 词  ${b.slug}`);
  }
}
