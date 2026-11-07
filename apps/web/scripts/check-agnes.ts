/**
 * 快速校验 Agnes key 是否被服务端接受（不发真实出图请求，几秒出结果）。
 *
 *   node --import tsx scripts/check-agnes.ts
 *
 * 原理：POST 一个空 body。token 无效 → 401；token 有效但缺参数 → 400/404/422。
 */
import { AGNES_ENDPOINT, AgnesError, agnesKeyFile, readAgnesKey } from "../lib/agnes";

try {
  const key = await readAgnesKey();
  console.log(`key 文件：${agnesKeyFile()}`);
  console.log(`key 长度：${key.length}（前 3 位 ${key.slice(0, 3)}）`);

  async function probe(): Promise<Response> {
    return fetch(AGNES_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(45_000),
    });
  }

  let response: Response;
  try {
    response = await probe();
  } catch {
    // 国内网关偶尔会拒一次连接，退避后重试一次
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      response = await probe();
    } catch (error) {
      console.log(`结果：网络不通，不是 key 的问题（${(error as Error).message}）`);
      process.exit(1);
    }
  }

  const text = (await response.text()).slice(0, 200);

  if (response.status === 401) {
    console.log("结果：key 被拒绝（HTTP 401）");
    console.log(text);
    process.exit(1);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    console.log(`结果：key 有效（HTTP ${response.status}，请求参数不完整）`);
    process.exit(0);
  }

  console.log(`结果：HTTP ${response.status}`);
  console.log(text);
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  if (error instanceof AgnesError) {
    console.error(`${error.code}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
