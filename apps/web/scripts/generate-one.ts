/**
 * 单张出图：不经过书籍数据，直接给 prompt 生成一张图。
 *
 *   node --import tsx scripts/generate-one.ts --prompt "..." [--size 1K|2K|3K|4K] [--ratio 16:9] [--out public/generated/x.png]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateImage, AgnesError } from "../lib/agnes";
import type { AgnesRatio } from "../lib/agnes";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const prompt = arg("prompt");
if (!prompt) {
  console.error("缺少 --prompt");
  process.exit(2);
}

const size = (arg("size", "2K") ?? "2K") as "1K" | "2K" | "3K" | "4K";
const ratio = (arg("ratio", "16:9") ?? "16:9") as AgnesRatio;
const out = path.resolve(arg("out", `public/generated/one-${Date.now()}.png`)!);

try {
  const t0 = Date.now();
  const image = await generateImage({ prompt, size, ratio, timeoutMs: 300_000 });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, image.bytes);
  console.log(
    `ok  ${out}  ${image.mime}  ${(image.bytes.length / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
} catch (err) {
  if (err instanceof AgnesError) {
    console.error(`Agnes ${err.code}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
