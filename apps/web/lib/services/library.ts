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
