/**
 * 修章节标题：没有独立标题的书，splitChapters 会把正文第一行当标题，
 * 合并后就变成 "CHAPTER 2. At the little town of Vevey, in Switzerland, there is a particularly（2）"。
 * 这里只改 .txt 里那一行标题，不碰正文，也不调用模型。
 *
 * 用法：node content-pipeline/fix-titles.mjs [--dry]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");
const TIERS = ["cet4", "cet6", "toefl"];

let changed = 0;
for (const tier of TIERS) {
  const dir = join(ROOT, "data", "adapted", tier);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".txt")) continue;
    const path = join(dir, name);
    const text = readFileSync(path, "utf8");
    const next = text.replace(/^CHAPTER (\d+)\. (.+)$/gm, (line, num, title) => {
      const t = title.trim();
      if (t.length > 60 || t.split(/\s+/).length > 10) return `CHAPTER ${num}. Part ${num}`;
      return line;
    });
    if (next !== text) {
      changed += 1;
      if (!DRY) writeFileSync(path, next, "utf8");
      console.log(`${DRY ? "[dry] " : ""}${tier}/${name}`);
    }
  }
}
console.log(`共 ${changed} 个文件需要修标题`);
