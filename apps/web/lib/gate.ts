import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ADMISSION } from "@/lib/domain/coverage";

export interface GateThreshold {
  coverage: number;
  perSentence: number;
}

export interface GateProfile {
  cet4: GateThreshold;
  cet6: GateThreshold;
  toefl?: GateThreshold;
  hardFloor: number;
}

export type GateProfileName = "calibrated" | "strict";

export interface GateConfig {
  active: GateProfileName;
  profiles: Record<GateProfileName, GateProfile>;
}

const FALLBACK: GateConfig = {
  active: "calibrated",
  profiles: {
    calibrated: { ...ADMISSION },
    strict: {
      cet4: { coverage: 0.97, perSentence: 0.5 },
      cet6: { coverage: 0.98, perSentence: 0.4 },
      toefl: { coverage: 0.985, perSentence: 0.3 },
      hardFloor: 0.93,
    },
  },
};

let cached: GateConfig | null = null;

/**
 * 准入闸配置来源是内容管线的产物（data/dist/gate.json），这样"书为什么被挡"
 * 和"页面显示的阈值"永远是同一套数字。管线没跑过时退回内置默认值。
 */
export function getGate(): GateConfig {
  // 生产环境缓存一份；开发环境每次读，方便切换 GATE_PROFILE 后立刻看到效果
  if (cached && process.env.NODE_ENV === "production") return cached;
  try {
    const raw = readFileSync(join(process.cwd(), "..", "..", "data", "dist", "gate.json"), "utf8");
    const parsed = JSON.parse(raw) as GateConfig;
    if (parsed?.profiles && parsed?.active) {
      cached = parsed;
      return parsed;
    }
  } catch {
    // 管线还没跑：用内置默认值，页面不至于打不开
  }
  cached = FALLBACK;
  return FALLBACK;
}

export function activeProfile(gate: GateConfig): GateProfile {
  return gate.profiles[gate.active] ?? gate.profiles.calibrated;
}

export function activeThresholds(gate: GateConfig, level?: string | null): GateThreshold {
  const profile = activeProfile(gate);
  if (level === "toefl" && profile.toefl) return profile.toefl;
  return level === "cet6" ? profile.cet6 : profile.cet4;
}

export const GATE_LABEL: Record<GateProfileName, string> = {
  calibrated: "实测校准",
  strict: "严格（97%/0.5）",
};
