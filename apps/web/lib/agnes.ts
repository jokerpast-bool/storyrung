import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Agnes 图像生成客户端。
 *
 * key 只从本地文件读，绝不硬编码、也不写日志：
 *   默认 ~/.dsh/secrets/agnes.key
 *   可用 AGNES_API_KEY_FILE 指向别的文件
 * 文件里只放一行 key（允许 # 注释和空行，取最后一个非空行）。
 */

/**
 * 默认国内网关（platform.agnes-ai.cn 控制台生成的 key 只在这个域生效）。
 * 国际站 key 用 AGNES_BASE_URL=https://apihub.agnes-ai.com/v1 覆盖。
 */
const DEFAULT_BASE_URL = "https://api.agnes-ai.cn/v1";

function baseUrl(): string {
  const fromEnv = process.env.AGNES_BASE_URL?.trim();
  return (fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export const AGNES_ENDPOINT = `${baseUrl()}/images/generations`;

/** 图像模型默认 agnes-image-2.5-flash，可用 AGNES_IMAGE_MODEL 覆盖。 */
const MODEL = process.env.AGNES_IMAGE_MODEL?.trim() || "agnes-image-2.5-flash";

export type AgnesSize = "1K" | "2K" | "3K" | "4K";
export type AgnesRatio = "1:1" | "3:4" | "4:3" | "16:9" | "9:16" | "2:3" | "3:2" | "21:9";

export class AgnesError extends Error {
  readonly code: "missing-key" | "bad-key" | "request" | "response";

  constructor(message: string, code: AgnesError["code"] = "request") {
    super(message);
    this.name = "AgnesError";
    this.code = code;
  }
}

export function agnesKeyFile(): string {
  const fromEnv = process.env.AGNES_API_KEY_FILE?.trim();
  return fromEnv && fromEnv.length > 0
    ? fromEnv
    : path.join(os.homedir(), ".dsh", "secrets", "agnes.key");
}

let cachedKey: string | null = null;

export async function readAgnesKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  const file = agnesKeyFile();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const envKey = process.env.AGNES_AI_API_KEY?.trim();
      if (envKey) {
        cachedKey = envKey;
        return envKey;
      }
      throw new AgnesError(
        `找不到 Agnes key 文件：${file}\n把 key 写进这个文件（只放一行），或用 AGNES_API_KEY_FILE 指定路径。`,
        "missing-key",
      );
    }
    throw new AgnesError(`无法读取 Agnes key 文件：${file}`, "missing-key");
  }

  const key =
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .pop() ?? "";

  if (!key) {
    throw new AgnesError(`Agnes key 文件是空的：${file}`, "missing-key");
  }

  cachedKey = key;
  return key;
}

export interface GenerateImageInput {
  prompt: string;
  size?: AgnesSize;
  ratio?: AgnesRatio;
  timeoutMs?: number;
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 同步出图：一次请求拿回成品（Agnes 图像接口不是轮询型任务）。
 * 429 / 5xx 指数退避重试，401 直接判定 key 有问题。
 */
export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const key = await readAgnesKey();
  const body = JSON.stringify({
    model: MODEL,
    prompt: input.prompt,
    size: input.size ?? "1K",
    ratio: input.ratio ?? "1:1",
    extra_body: { response_format: "url" },
  });

  let lastError: AgnesError | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(AGNES_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(input.timeoutMs ?? 300_000),
      });
    } catch (error) {
      lastError = new AgnesError(`Agnes 请求超时或网络不通：${(error as Error).message}`);
      await sleep(1500 * 2 ** attempt);
      continue;
    }

    if (response.status === 401) {
      throw new AgnesError("Agnes 拒绝了 key（HTTP 401）。检查 key 文件里是否只有一行完整 key。", "bad-key");
    }

    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 300);
      lastError = new AgnesError(`Agnes 请求失败：HTTP ${response.status} ${text}`.trim());
      if (response.status === 429 || response.status >= 500) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    const payload = (await response.json()) as {
      data?: Array<{ url?: string | null; b64_json?: string | null }>;
    };
    const item = payload.data?.[0];

    if (item?.b64_json) {
      return { bytes: Buffer.from(item.b64_json, "base64"), mime: "image/png" };
    }

    if (item?.url) {
      const image = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
      if (!image.ok) {
        throw new AgnesError(`下载生成结果失败：HTTP ${image.status}`, "response");
      }
      return {
        bytes: Buffer.from(await image.arrayBuffer()),
        mime: image.headers.get("content-type") ?? "image/png",
      };
    }

    throw new AgnesError("Agnes 响应里没有图片数据。", "response");
  }

  throw lastError ?? new AgnesError("Agnes 重试后仍失败。");
}
