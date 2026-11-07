import { prisma } from "@/lib/db";
import type { Level, VocabStatus } from "@/lib/domain/types";

/** M0 固定 demo 用户：登录体系在 M1 接入，先保证个性化链路可跑。 */
export const DEMO_USER_EMAIL = "demo@english-reading.local";

export interface AppUser {
  id: string;
  name: string;
  level: Level | "unknown";
  vocabSize: number;
  levelConfidence: number;
}

export async function getDemoUser(): Promise<AppUser> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      name: "Demo Learner",
      level: "unknown",
      vocabSize: 0,
    },
  });
  return {
    id: user.id,
    name: user.name,
    level: user.level as Level | "unknown",
    vocabSize: user.vocabSize,
    levelConfidence: user.levelConfidence,
  };
}

export interface VocabStateRow {
  lemma: string;
  status: VocabStatus;
  mastery: number;
}

export async function getVocabStates(userId: string): Promise<Map<string, VocabStateRow>> {
  const rows = await prisma.userVocabState.findMany({ where: { userId } });
  return new Map(
    rows.map((r) => [
      r.lemma,
      { lemma: r.lemma, status: r.status as VocabStatus, mastery: r.mastery },
    ]),
  );
}

/**
 * 这个用户"认识"的词集合：
 *   基线 = 词频前 vocabSize 的词（词汇量模型的直接推论）
 *   覆盖 = 显式 known / 掌握度 ≥ 0.7 的词加上，显式 unknown / uncertain 的词去掉
 */
export async function getKnownSet(
  userId: string,
  vocabSize: number,
  maxRank = 8000,
): Promise<Set<string>> {
  const [index, states] = await Promise.all([
    prisma.lemmaIndex.findMany({
      where: { freqRank: { lte: Math.max(vocabSize, 1) } },
      select: { lemma: true },
    }),
    getVocabStates(userId),
  ]);

  const known = new Set(index.map((i) => i.lemma));
  for (const state of states.values()) {
    if (state.status === "known" || (state.status === "learning" && state.mastery >= 0.7)) {
      known.add(state.lemma);
    } else if (state.status === "unknown" || state.status === "uncertain") {
      known.delete(state.lemma);
    }
  }
  return known;
}

/** 新用户没有词汇状态时的兜底：用等级默认词汇量当基线。 */
export function effectiveVocabSize(user: AppUser): number {
  if (user.vocabSize > 0) return user.vocabSize;
  return user.level === "cet6" ? 6000 : 4500;
}
