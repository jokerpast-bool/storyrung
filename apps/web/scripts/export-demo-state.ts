import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = "demo@english-reading.local";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    include: {
      vocabStates: true,
      progress: { include: { chapter: { include: { book: true } } } },
    },
  });
  if (!user) throw new Error("找不到 demo 用户");

  const state = {
    email: EMAIL,
    level: user.level,
    vocabSize: user.vocabSize,
    progress: user.progress
      .filter((row) => row.position > 0 || row.completedAt)
      .map((row) => ({
        bookSlug: row.chapter.book.slug,
        chapterIndex: row.chapter.index,
        position: row.position,
        completed: Boolean(row.completedAt),
      }))
      .sort((a, b) => a.bookSlug.localeCompare(b.bookSlug) || a.chapterIndex - b.chapterIndex),
    vocab: user.vocabStates.map((row) => ({
      lemma: row.lemma,
      status: row.status,
      mastery: row.mastery,
      source: row.source,
    })),
  };

  const out = join(process.cwd(), "..", "..", "data", "demo-state.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(
    `demo 状态：${state.level} ${state.vocabSize} 词，进度 ${state.progress.length} 条，生词 ${state.vocab.length} 条`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
