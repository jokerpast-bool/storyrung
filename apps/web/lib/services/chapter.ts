import { prisma } from "@/lib/db";
import { coverage, type LemmaCounts } from "@/lib/domain/coverage";
import { PREP_LIMITS, selectPrepPackage, shortGloss } from "@/lib/domain/prep";
import type { Band, SentenceData, Token, VocabEntry } from "@/lib/domain/types";
import type { VocabStateRow } from "./user";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * token 在管线里是紧凑数组 [surface, lemma, start, end]（体积只有对象数组的 60%），
 * 但组件需要具名对象。这里统一转换，并兼容早期写入的对象格式。
 */
function mapTokens(raw: string): Token[] {
  const parsed = parseJson<unknown[]>(raw, []);
  return parsed.map((entry) => {
    if (Array.isArray(entry)) {
      return {
        surface: String(entry[0] ?? ""),
        lemma: String(entry[1] ?? ""),
        start: Number(entry[2] ?? 0),
        end: Number(entry[3] ?? 0),
      };
    }
    return entry as Token;
  });
}

export interface ChapterBundle {
  id: string;
  bookSlug: string;
  bookTitle: string;
  bookLevel: string;
  index: number;
  title: string;
  wordCount: number;
  sentenceCount: number;
  estMinutes: number;
  lemmaCounts: LemmaCounts;
  vocab: VocabEntry[];
  sentences: SentenceData[];
  prepStatus: string;
  position: number;
}

async function loadChapter(slug: string, index: number): Promise<ChapterBundle | null> {
  const chapter = await prisma.chapter.findFirst({
    where: { index, book: { slug } },
    include: {
      book: true,
      vocab: { orderBy: { importance: "desc" } },
      sentences: { orderBy: { index: "asc" } },
    },
  });
  if (!chapter) return null;
  return {
    id: chapter.id,
    bookSlug: chapter.book.slug,
    bookTitle: chapter.book.title,
    bookLevel: chapter.book.level,
    index: chapter.index,
    title: chapter.title,
    wordCount: chapter.wordCount,
    sentenceCount: chapter.sentenceCount,
    estMinutes: chapter.estMinutes,
    lemmaCounts: parseJson<LemmaCounts>(chapter.lemmaCounts, {}),
    prepStatus: "locked",
    position: 0,
    vocab: chapter.vocab.map((v) => ({
      lemma: v.lemma,
      kind: v.kind as "word" | "phrase",
      phrase: v.phrase,
      surfaceForms: parseJson<string[]>(v.surfaceForms, []),
      pos: v.pos,
      phonetic: v.phonetic,
      definitionZh: v.definitionZh,
      freqRank: v.freqRank,
      band: v.band as Band,
      importance: v.importance,
      occurrenceCount: v.occurrenceCount,
    })),
    sentences: chapter.sentences.map((s) => ({
      index: s.index,
      text: s.text,
      tokens: mapTokens(s.tokens),
      hardScore: s.hardScore,
      keyVocab: parseJson<string[]>(s.keyVocab, []),
    })),
  };
}

export interface PrepView {
  chapter: ChapterBundle;
  words: VocabEntry[];
  phrases: VocabEntry[];
  hardSentences: SentenceData[];
  coverage: number;
  currentCoverage: number;
  progress: { prepStatus: string; prepScore: number; position: number };
  options: Record<string, string[]>; // lemma -> 4 个中文释义（含正确项）
  states: Map<string, VocabStateRow>;
}

/** 预习页：按用户未知状态筛出本章该练的词/短语/长难句。 */
export async function getPrepView(
  slug: string,
  index: number,
  userId: string,
  known: ReadonlySet<string>,
  states: Map<string, VocabStateRow>,
): Promise<PrepView | null> {
  const chapter = await loadChapter(slug, index);
  if (!chapter) return null;

  const pkg = selectPrepPackage(chapter.vocab, states);
  const hardSentences = chapter.sentences
    .filter((s) => s.hardScore >= 0.55)
    .sort((a, b) => b.hardScore - a.hardScore)
    .slice(0, PREP_LIMITS.sentences);

  // 选项与题面统一用短释义，避免四个选项都是"n. …；vt. …；a. …"看不出差别
  const words = pkg.words.map((w) => ({ ...w, definitionZh: shortGloss(w.definitionZh) }));
  const phrases = pkg.phrases.map((w) => ({ ...w, definitionZh: shortGloss(w.definitionZh) }));

  const progress = await prisma.chapterProgress.findUnique({
    where: { userId_chapterId: { userId, chapterId: chapter.id } },
  });

  const pool = [...words, ...phrases].map((v) => v.definitionZh).filter((d) => d.length > 1);
  const options: Record<string, string[]> = {};
  for (const word of [...words, ...phrases]) {
    const others = pool.filter((d) => d !== word.definitionZh);
    const picked = shuffle(others).slice(0, 3);
    while (picked.length < 3) picked.push("（以上都不是）");
    options[word.lemma] = shuffle([word.definitionZh, ...picked]);
  }

  return {
    chapter,
    words,
    phrases,
    hardSentences,
    coverage: coverage(chapter.lemmaCounts, known),
    currentCoverage: coverage(chapter.lemmaCounts, known),
    progress: {
      prepStatus: progress?.prepStatus ?? "locked",
      prepScore: progress?.prepScore ?? 0,
      position: progress?.position ?? 0,
    },
    options,
    states,
  };
}

export interface ReaderView {
  chapter: ChapterBundle;
  coverage: number;
  position: number;
  prepStatus: string;
}

export async function getReaderView(
  slug: string,
  index: number,
  userId: string,
  known: ReadonlySet<string>,
): Promise<ReaderView | null> {
  const chapter = await loadChapter(slug, index);
  if (!chapter) return null;
  const progress = await prisma.chapterProgress.findUnique({
    where: { userId_chapterId: { userId, chapterId: chapter.id } },
  });
  return {
    chapter,
    coverage: coverage(chapter.lemmaCounts, known),
    position: progress?.position ?? 0,
    prepStatus: progress?.prepStatus ?? "locked",
  };
}

/** 运行时查词：先查本章词表，再查全书词表索引。 */
export async function lookupLemma(chapterId: string, lemma: string) {
  const inChapter = await prisma.chapterVocab.findUnique({
    where: { chapterId_lemma: { chapterId, lemma } },
  });
  if (inChapter) {
    return {
      lemma,
      definitionZh: inChapter.definitionZh,
      phonetic: inChapter.phonetic,
      pos: inChapter.pos,
      band: inChapter.band,
      freqRank: inChapter.freqRank,
      inChapter: true,
    };
  }
  const inIndex = await prisma.lemmaIndex.findUnique({ where: { lemma } });
  if (!inIndex) return null;
  return {
    lemma,
    definitionZh: inIndex.definitionZh,
    phonetic: inIndex.phonetic,
    pos: inIndex.pos,
    band: inIndex.band,
    freqRank: inIndex.freqRank,
    inChapter: false,
  };
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
