import { prisma } from "@/lib/db";
import { chapterReadability, coverage, type LemmaCounts } from "@/lib/domain/coverage";

function parseCounts(raw: string): LemmaCounts {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as LemmaCounts) : {};
  } catch {
    return {};
  }
}

export interface BookCard {
  id: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  level: string;
  /** 改写版目标档位：cet4 | cet6 | toefl，空串表示原文 */
  adaptedTier: string;
  coverEmoji: string;
  wordCount: number;
  chapterCount: number;
  difficulty: number;
  admission: string;
  gateCoverage: number;
  gateUnknownPerSentence: number;
  gateReason: string;
  /** 这个用户读这本书的预计覆盖率 */
  personalCoverage: number;
  /** 这个用户会遇到的不同生词数 */
  estUnknownWords: number;
}

export interface BookDetail extends BookCard {
  license: string;
  sourceUrl: string;
  chapters: ChapterRow[];
}

export interface ChapterRow {
  id: string;
  index: number;
  title: string;
  wordCount: number;
  sentenceCount: number;
  hardSentences: number;
  estMinutes: number;
  coverage: number;
  unknownWords: number;
  prepStatus: string;
  position: number;
  completed: boolean;
}

/** 书库：通过准入闸的书 + 这个用户的个性化可读性。 */
export async function listLibrary(
  userId: string,
  known: ReadonlySet<string>,
  options: { level?: string; admission?: "pass" | "challenge" | "fail" | "all" } = {},
): Promise<BookCard[]> {
  const admission = options.admission ?? "pass";
  const books = await prisma.book.findMany({
    where: {
      ...(options.level ? { level: options.level } : {}),
      ...(admission === "all" ? {} : { admission }),
    },
    orderBy: [{ level: "asc" }, { difficulty: "asc" }],
  });

  return books.map((book) => {
    const counts = parseCounts(book.lemmaCounts);
    const unknown = Object.keys(counts).filter((lemma) => !known.has(lemma));
    return {
      id: book.id,
      slug: book.slug,
      title: book.title,
      author: book.author,
      description: book.description,
      level: book.level,
      adaptedTier: book.adaptedTier,
      coverEmoji: book.coverEmoji,
      wordCount: book.wordCount,
      chapterCount: book.chapterCount,
      difficulty: book.difficulty,
      admission: book.admission,
      gateCoverage: book.gateCoverage,
      gateUnknownPerSentence: book.gateUnknownPerSentence,
      gateReason: book.gateReason,
      personalCoverage: coverage(counts, known),
      estUnknownWords: unknown.length,
    };
  });
}

export interface ContinueReading {
  bookSlug: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  /** 本章句子数，用来算读了多少 */
  sentenceCount: number;
  position: number;
  percent: number;
  /** 这一章已经读完：链接指下一章 */
  finished: boolean;
  /** 读完最后一章时为 true，链接回到书详情 */
  atEnd: boolean;
}

/**
 * 首页「接着读」：找这个用户最近动过的一章。
 * 只认真的读过（position > 0）或标记读完了的记录，避免刚做完预习就被当成在读。
 */
export async function getContinueReading(userId: string): Promise<ContinueReading | null> {
  const row = await prisma.chapterProgress.findFirst({
    where: {
      userId,
      OR: [{ position: { gt: 0 } }, { completedAt: { not: null } }],
    },
    orderBy: { updatedAt: "desc" },
    include: { chapter: { include: { book: true } } },
  });
  if (!row) return null;

  const { chapter } = row;
  const finished = Boolean(row.completedAt);
  if (!finished) {
    return {
      bookSlug: chapter.book.slug,
      bookTitle: chapter.book.title,
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      sentenceCount: chapter.sentenceCount,
      position: row.position,
      percent: Math.min(99, Math.round(((row.position + 1) / Math.max(1, chapter.sentenceCount)) * 100)),
      finished: false,
      atEnd: false,
    };
  }

  // 读完了：优先指下一章；已经是最后一章就回书详情
  const next = await prisma.chapter.findFirst({
    where: { bookId: chapter.bookId, index: { gt: chapter.index } },
    orderBy: { index: "asc" },
  });
  return {
    bookSlug: chapter.book.slug,
    bookTitle: chapter.book.title,
    chapterIndex: next?.index ?? chapter.index,
    chapterTitle: next?.title ?? chapter.title,
    sentenceCount: next?.sentenceCount ?? chapter.sentenceCount,
    position: 0,
    percent: finished && !next ? 100 : 0,
    finished: true,
    atEnd: !next,
  };
}

export async function getBookDetail(
  slug: string,
  userId: string,
  known: ReadonlySet<string>,
): Promise<BookDetail | null> {
  const book = await prisma.book.findUnique({
    where: { slug },
    include: {
      chapters: {
        orderBy: { index: "asc" },
      },
    },
  });
  if (!book) return null;

  const progress = await prisma.chapterProgress.findMany({
    where: { userId, chapterId: { in: book.chapters.map((c) => c.id) } },
  });
  const progressByChapter = new Map(progress.map((p) => [p.chapterId, p]));
  const counts = parseCounts(book.lemmaCounts);

  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    description: book.description,
    level: book.level,
    adaptedTier: book.adaptedTier,
    coverEmoji: book.coverEmoji,
    wordCount: book.wordCount,
    chapterCount: book.chapterCount,
    difficulty: book.difficulty,
    admission: book.admission,
    gateCoverage: book.gateCoverage,
    gateUnknownPerSentence: book.gateUnknownPerSentence,
    gateReason: book.gateReason,
    personalCoverage: coverage(counts, known),
    estUnknownWords: Object.keys(counts).filter((l) => !known.has(l)).length,
    license: book.license,
    sourceUrl: book.sourceUrl,
    chapters: book.chapters.map((chapter) => {
      const chapterCounts = parseCounts(chapter.lemmaCounts);
      const readability = chapterReadability(chapterCounts, known);
      const p = progressByChapter.get(chapter.id);
      return {
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        wordCount: chapter.wordCount,
        sentenceCount: chapter.sentenceCount,
        hardSentences: chapter.hardSentences,
        estMinutes: chapter.estMinutes,
        coverage: readability.coverage,
        unknownWords: readability.unknownWords,
        prepStatus: p?.prepStatus ?? "locked",
        position: p?.position ?? 0,
        completed: Boolean(p?.completedAt),
      };
    }),
  };
}
