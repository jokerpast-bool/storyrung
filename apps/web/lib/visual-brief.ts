import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * 书封的"画面说明"：先用 DeepSeek 把书名/作者/开头几句话压缩成一句画面描述，
 * 再把这句话交给 Agnes 出图。结果按 slug 缓存在 data/covers/briefs.json，
 * 重新生成封面时不需要重复调用。
 */

const BRIEFS_FILE = path.resolve(process.cwd(), "..", "..", "data", "covers", "briefs.json");

export type BriefMap = Record<string, string>;

/**
 * 手工兜底的画面说明：有些题材（战争、伤口）会触发图片服务的内容策略，
 * 或者自动生成的 brief 太抽象，这里直接给一个安全、具体的版本。
 */
const MANUAL_BRIEFS: BriefMap = {
  "the-red-badge-of-courage":
    "A worn canvas knapsack, a dented tin canteen and a folded letter rest in tall summer grass at dawn, " +
    "a red cloth banner tied to a wooden fence post further up the hill, soft pink sky, quiet and reflective.",
};

export function manualBrief(slug: string): string | null {
  return MANUAL_BRIEFS[slug] ?? null;
}

export async function loadBriefs(): Promise<BriefMap> {
  try {
    const raw = await fs.readFile(BRIEFS_FILE, "utf8");
    const parsed = JSON.parse(raw) as BriefMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveBriefs(map: BriefMap): Promise<void> {
  await fs.mkdir(path.dirname(BRIEFS_FILE), { recursive: true });
  await fs.writeFile(BRIEFS_FILE, JSON.stringify(map, null, 2), "utf8");
}

async function deepSeekKey(): Promise<string | null> {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const text = await fs.readFile(path.join(os.homedir(), ".dsh", ".credentials.yaml"), "utf8");
    const match = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(\S+)\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function displayAuthor(author: string): string {
  const cleaned = author.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  const swapped = cleaned.match(/^([^,]+),\s*(.+)$/);
  return swapped ? `${swapped[2]} ${swapped[1]}`.trim() : cleaned;
}

/** 返回一句画面描述；失败时返回 null，让调用方退回标题兜底。 */
export async function deepSeekBrief(input: {
  title: string;
  author: string;
  excerpt?: string;
}): Promise<string | null> {
  const key = await deepSeekKey();
  if (!key) return null;

  const user = [
    `Title: ${input.title}`,
    `Author: ${displayAuthor(input.author)}`,
    input.excerpt ? `Excerpt: ${input.excerpt.replace(/\s+/g, " ").slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.7,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are an art director for classic book covers. Given a title and an optional excerpt, " +
              "reply with ONE vivid sentence (max 35 words) describing the single most iconic scene or object " +
              "to paint on the cover. Prefer recognizable characters and settings. No text, no lettering, no title words.",
          },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text ? text.replace(/^["“]|["”]$/g, "").slice(0, 400) : null;
  } catch {
    return null;
  }
}
