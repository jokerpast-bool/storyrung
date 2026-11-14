import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { AgnesError, generateImage } from "@/lib/agnes";
import {
  chapterArtUrl,
  chapterFilePath,
  coverFilePath,
  coverPrompt,
  coverUrl,
  excerptFrom,
  illustrationPrompt,
} from "@/lib/generated-art";
import { deepSeekBrief, loadBriefs, manualBrief, saveBriefs } from "@/lib/visual-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 图生成本身是同步的，但一次只放一个请求，避免连点把额度打穿。 */
let inFlight = false;
let lastFinishedAt = 0;
const MIN_INTERVAL_MS = 2500;

interface Payload {
  kind?: "cover" | "chapter";
  slug?: string;
  index?: number;
  force?: boolean;
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null;
  if (!payload || (payload.kind !== "cover" && payload.kind !== "chapter") || !payload.slug) {
    return fail("请求需要 { kind: 'cover' | 'chapter', slug, index? }", 400);
  }

  const now = Date.now();
  if (inFlight) return fail("上一张还在生成，稍等几秒", 429);
  if (now - lastFinishedAt < MIN_INTERVAL_MS) return fail("生成太快了，稍等几秒", 429);

  inFlight = true;
  try {
    const book = await prisma.book.findUnique({ where: { slug: payload.slug } });
    if (!book) return fail(`没有这本书：${payload.slug}`, 404);

    if (payload.kind === "cover") {
      const existing = coverUrl(book.slug);
      if (existing && !payload.force) return NextResponse.json({ ok: true, url: existing, cached: true });

      const firstChapter = await prisma.chapter.findFirst({
        where: { bookId: book.id },
        orderBy: { index: "asc" },
        select: { id: true },
      });
      const opening = firstChapter
        ? await prisma.chapterSentence.findMany({
            where: { chapterId: firstChapter.id },
            orderBy: { index: "asc" },
            take: 2,
            select: { text: true },
          })
        : [];

      // 画面描述优先用缓存，缺了就现场让 DeepSeek 写一句
      const briefs = await loadBriefs();
      let brief = manualBrief(book.slug) ?? briefs[book.slug];
      if (!brief) {
        const written = await deepSeekBrief({
          title: book.title,
          author: book.author,
          excerpt: excerptFrom(opening, 500),
        });
        if (written) {
          brief = written;
          briefs[book.slug] = written;
          await saveBriefs(briefs);
        }
      }

      const started = Date.now();
      const image = await generateImage({
        prompt: coverPrompt({ title: book.title, author: book.author }, brief),
        size: "1K",
        ratio: "3:4",
        timeoutMs: 240_000,
      });
      const file = coverFilePath(book.slug);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, image.bytes);
      return NextResponse.json({
        ok: true,
        url: coverUrl(book.slug),
        bytes: image.bytes.length,
        ms: Date.now() - started,
      });
    }

    const index = Number(payload.index);
    if (!Number.isInteger(index) || index < 1) return fail("chapter 请求需要合法的 index", 400);

    const chapter = await prisma.chapter.findFirst({
      where: { bookId: book.id, index },
      select: { id: true, title: true },
    });
    if (!chapter) return fail(`没有第 ${index} 章`, 404);

    const existing = chapterArtUrl(book.slug, index);
    if (existing && !payload.force) return NextResponse.json({ ok: true, url: existing, cached: true });

    const sentences = await prisma.chapterSentence.findMany({
      where: { chapterId: chapter.id },
      orderBy: { index: "asc" },
      take: 2,
      select: { text: true },
    });

    const started = Date.now();
    const image = await generateImage({
      prompt: illustrationPrompt(
        { title: book.title, author: book.author },
        { title: chapter.title, excerpt: excerptFrom(sentences) },
      ),
      size: "1K",
      ratio: "16:9",
    });
    const file = chapterFilePath(book.slug, index);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, image.bytes);
    return NextResponse.json({
      ok: true,
      url: chapterArtUrl(book.slug, index),
      bytes: image.bytes.length,
      ms: Date.now() - started,
    });
  } catch (cause) {
    if (cause instanceof AgnesError) {
      const status = cause.code === "missing-key" ? 500 : cause.code === "bad-key" ? 502 : 502;
      return fail(cause.message, status);
    }
    console.error("[images] 生成失败：", (cause as Error).message);
    return fail(`生成失败：${(cause as Error).message}`, 500);
  } finally {
    inFlight = false;
    lastFinishedAt = Date.now();
  }
}
