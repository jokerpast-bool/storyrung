export type Level = "cet4" | "cet6" | "toefl";
export type VocabStatus = "unknown" | "uncertain" | "learning" | "known";
export type Band = "cet4" | "cet6" | "beyond";

export interface Token {
  surface: string;
  lemma: string;
  start: number;
  end: number;
}

export interface SentenceData {
  index: number;
  text: string;
  tokens: Token[];
  hardScore: number;
  keyVocab: string[];
}

export interface VocabEntry {
  lemma: string;
  kind: "word" | "phrase";
  phrase?: string;
  surfaceForms: string[];
  pos: string;
  phonetic: string;
  definitionZh: string;
  freqRank: number;
  band: Band;
  importance: number;
  occurrenceCount: number;
}

export interface ChapterMetrics {
  wordCount: number;
  sentenceCount: number;
  hardSentences: number;
  difficulty: number;
  estMinutes: number;
}

export interface AdmissionResult {
  pass: boolean;
  coverage: number;
  unknownPerSentence: number;
  reasons: string[];
}
