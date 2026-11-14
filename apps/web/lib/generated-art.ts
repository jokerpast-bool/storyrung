import fs from "node:fs";
import path from "node:path";

import { displayAuthor } from "./visual-brief";

/**
 * 生成图的落盘位置与提示词。
 *
 * 图片放在 public/generated/ 下（整个目录 .gitignore，不入库）：
 *   covers/<slug>.png
 *   chapters/<slug>/<index>.png
 */

export const GENERATED_ROOT = path.join(process.cwd(), "public", "generated");

const STYLE =
  "antique storybook illustration, gouache with fine ink linework, warm cream paper texture, " +
  "muted teal and burnt ochre palette, soft diffused light, rich intricate detail, " +
  "no text, no lettering, no watermark, no border, no frame";

/** 书封统一风格：现代水彩绘本（用户选定的第 4 款）。 */
const COVER_STYLE =
  "soft modern watercolour picture book illustration, loose transparent washes, " +
  "visible paper grain, gentle luminous palette, painterly edges, calm and quiet mood, " +
  "no photographic realism, no 3d render";

function cleanLine(value: string): string {
  return value
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortTitle(title: string): string {
  return cleanLine(title.replace(/\s*[:;—–].*$/, ""));
}

export function coverFilePath(slug: string): string {
  return path.join(GENERATED_ROOT, "covers", `${slug}.png`);
}

export function chapterFilePath(slug: string, index: number): string {
  return path.join(GENERATED_ROOT, "chapters", slug, `${index}.png`);
}

function urlWithMtime(filePath: string, url: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return null;
    return `${url}?v=${Math.round(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

export function coverUrl(slug: string): string | null {
  return urlWithMtime(coverFilePath(slug), `/generated/covers/${slug}.png`);
}

export function chapterArtUrl(slug: string, index: number): string | null {
  return urlWithMtime(chapterFilePath(slug, index), `/generated/chapters/${slug}/${index}.png`);
}

export function coverPrompt(book: { title: string; author: string }, brief?: string): string {
  const title = shortTitle(book.title);
  const author = displayAuthor(book.author);
  const scene = brief && brief.trim().length > 0 ? cleanLine(brief) : `a symbolic scene that captures ${title}`;
  return [
    "Book front cover, portrait 3:4 composition, flat artwork, no mockup, no spine, no frame.",
    `Style: ${COVER_STYLE}.`,
    `Subject: ${scene}`,
    `Lettering: handwritten brush script across the upper part spelling ${title}; near the bottom edge a smaller script line spelling ${author}.`,
    "Do not draw quotation marks, brackets, colons or any punctuation around the lettering. No other words, no watermark.",
  ].join(" ");
}

export function illustrationPrompt(
  book: { title: string; author: string },
  chapter: { title: string; excerpt?: string },
): string {
  const scene = chapter.excerpt ? ` Story moment: ${chapter.excerpt}` : "";
  return (
    `Illustration for chapter "${chapter.title}" of the novel "${book.title}" by ${book.author}.${scene} ` +
    "Wide cinematic 16:9 composition, one clear focal scene, atmospheric depth, " +
    STYLE
  );
}

/** 取章节开头两句当"画面提示"，避免模型瞎猜。 */
export function excerptFrom(sentences: Array<{ text: string }>, maxChars = 320): string {
  const joined = sentences
    .slice(0, 2)
    .map((sentence) => sentence.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}…` : joined;
}
