/**
 * 把内容管线的产物灌进数据库。
 * 用法：pnpm db:seed（cwd = apps/web）
 * 幂等：先清空内容表（书 / 章 / 词 / 句 / 词表索引 / 测评题），用户数据保留。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DIST = join(process.cwd(), "..", "..", "data", "dist");

interface RawVocab {
  lemma: string;
  kind?: string;
  surfaceForms: string[];
  occurrenceCount: number;
  definitionZh: string;
  phonetic: string;
  pos: string;
  freqRank: number;
  band: string;
  importance: number;
}

interface RawSentence {
  index: number;
  text: string;
  tokens: { surface: string; lemma: string; start: number; end: number }[];
  hardScore: number;
  keyVocab: string[];
}

interface RawChapter {
  index: number;
  title: string;
  wordCount: number;
  sentenceCount: number;
  hardSentences: number;
  difficulty: number;
  estMinutes: number;
  lemmaCounts: Record<string, number>;
  vocab: RawVocab[];
  sentences: RawSentence[];
}

interface RawBook {
  slug: string;
  title: string;
  author: string;
  coverEmoji: string;
  description: string;
  level: string;
  license: string;
  sourceUrl: string;
  wordCount: number;
  chapterCount: number;
  tokenCount: number;
  difficulty: number;
  admission: string;
  gateCoverage: number;
  gateUnknownPerSentence: number;
  gateReason: string;
  lemmaCounts: Record<string, number>;
  chapters: RawChapter[];
}

interface RawLemmaIndex {
  lemma: string;
  freqRank: number;
  band: string;
  definitionZh: string;
  phonetic: string;
  pos: string;
  inBooks: number;
}

interface RawLevelItem {
  lemma: string;
  band: number;
  definitionZh: string;
  pos: string;
  freqRank: number;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(join(DIST, file), "utf8")) as T;
}

async function main() {
  const [books, lemmaIndex, levelItems] = await Promise.all([
    readJson<RawBook[]>("books.json"),
    readJson<RawLemmaIndex[]>("lemma-index.json"),
    readJson<RawLevelItem[]>("level-items.json"),
  ]);

  console.log(`· 清理内容表 …`);
  await prisma.chapterSentence.deleteMany();
  await prisma.chapterVocab.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.book.deleteMany();
  await prisma.lemmaIndex.deleteMany();
  await prisma.levelItem.deleteMany();

  console.log(`· 词表索引 ${lemmaIndex.length} 条 …`);
  for (let i = 0; i < lemmaIndex.length; i += 500) {
    await prisma.lemmaIndex.createMany({ data: lemmaIndex.slice(i, i + 500) });
  }

  console.log(`· 测评题库 ${levelItems.length} 条 …`);
  await prisma.levelItem.createMany({ data: levelItems });

  for (const book of books) {
    console.log(`· 《${book.title}》 ${book.chapters.length} 章 …`);
    const created = await prisma.book.create({
      data: {
        slug: book.slug,
        title: book.title,
        author: book.author,
        level: book.level,
        description: book.description,
        license: book.license,
        sourceUrl: book.sourceUrl,
        coverEmoji: book.coverEmoji,
        wordCount: book.wordCount,
        chapterCount: book.chapterCount,
        tokenCount: book.tokenCount,
        difficulty: book.difficulty,
        admission: book.admission,
        gateCoverage: book.gateCoverage,
        gateUnknownPerSentence: book.gateUnknownPerSentence,
        gateReason: book.gateReason,
        lemmaCounts: JSON.stringify(book.lemmaCounts),
      },
    });

    for (const chapter of book.chapters) {
      const chapterRow = await prisma.chapter.create({
        data: {
          bookId: created.id,
          index: chapter.index,
          title: chapter.title,
          wordCount: chapter.wordCount,
          sentenceCount: chapter.sentenceCount,
          hardSentences: chapter.hardSentences,
          difficulty: chapter.difficulty,
          estMinutes: chapter.estMinutes,
          lemmaCounts: JSON.stringify(chapter.lemmaCounts),
        },
      });

      if (chapter.vocab.length > 0) {
        await prisma.chapterVocab.createMany({
          data: chapter.vocab.map((v) => ({
            chapterId: chapterRow.id,
            lemma: v.lemma,
            kind: v.kind === "phrase" ? "phrase" : "word",
            phrase: v.kind === "phrase" ? v.lemma : "",
            surfaceForms: JSON.stringify(v.surfaceForms),
            pos: v.pos,
            phonetic: v.phonetic,
            definitionZh: v.definitionZh,
            freqRank: v.freqRank,
            band: v.band,
            importance: v.importance,
            occurrenceCount: v.occurrenceCount,
          })),
        });
      }

      for (let i = 0; i < chapter.sentences.length; i += 200) {
        await prisma.chapterSentence.createMany({
          data: chapter.sentences.slice(i, i + 200).map((s) => ({
            chapterId: chapterRow.id,
            index: s.index,
            text: s.text,
            tokens: JSON.stringify(s.tokens),
            hardScore: s.hardScore,
            keyVocab: JSON.stringify(s.keyVocab),
          })),
        });
      }
    }
  }

  const counts = {
    books: await prisma.book.count(),
    chapters: await prisma.chapter.count(),
    vocab: await prisma.chapterVocab.count(),
    sentences: await prisma.chapterSentence.count(),
    lemmas: await prisma.lemmaIndex.count(),
    levelItems: await prisma.levelItem.count(),
  };
  console.log("· 完成：", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
