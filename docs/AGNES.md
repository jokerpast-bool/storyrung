# AI 书封与章节插图（Agnes Image）

站里的书封和章节插图由 [Agnes Image 2.5 Flash](https://www.agnes-ai.com/zh-Hans/docs/agnes-image-25-flash) 生成。图**不进仓库**，key **不进代码**。

## 1. Key 放哪

默认读取：

```
C:\Users\Lenovo\.dsh\secrets\agnes.key      （Windows）
~/.dsh/secrets/agnes.key                    （macOS / Linux）
```

文件里只放一行 key，允许 `#` 注释和空行，取最后一个非空行：

```
# Agnes API key
sk-xxxxxxxx
```

想换位置就设环境变量 `AGNES_API_KEY_FILE` 指向别的文件；再退一步才用环境变量 `AGNES_AI_API_KEY`。
key 只在服务端 `lib/agnes.ts` 里读取，不进日志、不进错误信息、不进 git。

**网关**：默认 `https://api.agnes-ai.cn/v1`（对应 `platform.agnes-ai.cn` 控制台生成的 key）。
国际站（`platform.agnes-ai.com` / `agnes-ai.com` 文档）的 key 要显式换网关，否则一律 `401 Invalid token`：

```powershell
$env:AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1"
```

收紧文件权限（可选）：

```powershell
icacls "$env:USERPROFILE\.dsh\secrets\agnes.key" /inheritance:r /grant:r "$env:USERNAME:(R)"
```

## 2. 生成

图落在 `apps/web/public/generated/`（整个目录已在 `.gitignore`）：

```
public/generated/covers/<slug>.png          书封，1K / 3:4 → 864×1152
public/generated/chapters/<slug>/<n>.png    章节插图，1K / 16:9 → 1312×736
```

命令（在 `apps/web` 下）：

```bash
npm run covers                             # 全部书封，水彩风（已有图跳过，可断点续跑）
npm run covers -- --force                  # 全部重画
npm run covers -- --slug the-wonderful-wizard-of-oz --force
npm run covers -- --limit 10 --concurrency 3
npm run images -- --chapter the-wonderful-wizard-of-oz 1   # 章节插图（另一种风格）
```

书封分两步：先用 DeepSeek 把书名/作者/开头几句话压成一句"画面描述"（缓存到
`data/covers/briefs.json`），再交给 Agnes 画成水彩封面并写上书名与作者。
`--concurrency` 默认 2；免费档并发 3 时偶尔会遇到 HTTP 429，重跑即可（已有图会跳过）。

参数：`--limit N` 限张数、`--interval 800` 请求间隔（毫秒）、`--force` 重画已有图、
`--slug <slug>` 只画一本。已有图默认跳过，所以命令可以反复跑、断点续传。

### 单张图（任意 prompt）

不依赖书籍数据，直接给一句话出图：

```bash
npm run image -- --prompt "银河系..." --size 2K --ratio 16:9 --out public/generated/galaxy.png
```

`--size` 取 `1K|2K|3K|4K`，`--ratio` 取 `1:1|3:4|4:3|16:9|9:16|2:3|3:2|21:9`。

### 先验证 key

拿到新 key 不必先出图，空 body 探一次就知道服务端认不认：

```bash
npm run check-key
# key 长度：51（前 3 位 sk-）
# 结果：key 被拒绝（HTTP 401）        ← 无效（或网关不对）
# 结果：key 有效（HTTP 400/404，仅参数问题）  ← 有效
```

注意 `GET /v1/models` **不校验 token**（随便填一个假 key 也返回 200），不能拿来验 key。

> 在 DSH 沙箱里跑会 `spawn EPERM`（tsx 要起 esbuild）；用普通终端，或在 DSH 里批准一次 full access。

## 3. 页面里的表现

- **书封**：`public/generated/covers/<slug>.png` 存在就用真图，不存在退回渐变色块 + 首字母（`components/BookCover.tsx`）。
- **章节插图**：阅读页顶部显示 `ChapterArt`；没有图时显示「给这一章配张插图」按钮，点了走 `POST /api/images`，生成完刷新页面。
- **按需接口**：

```bash
curl -X POST http://127.0.0.1:3100/api/images \
  -H "content-type: application/json" \
  -d '{"kind":"cover","slug":"the-wonderful-wizard-of-oz"}'
# {"ok":true,"url":"/generated/covers/the-wonderful-wizard-of-oz.png?v=...","bytes":...,"ms":...}
```

接口有 2.5s 最小间隔 + 单请求并发锁，连点会被 429 挡掉。

## 4. 成本与限速

- 图像生成目前是促销价 **$0 / 张**（标准价 $0.003/张）。
- 免费账号按 RPM 限流：1K 约 30 次/分（实际限速 20），2K 更低；3K/4K 只有 1–2 次/分。
- 脚本默认每张间隔 2.6s，单张 5~15 秒。109 张书封约 8 分钟。
- 429 会自动指数退避重试（2s→4s→8s）。

## 5. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `找不到 Agnes key 文件：...` | 文件不存在 | 把 key 写进 `~/.dsh/secrets/agnes.key` |
| `Agnes 拒绝了 key（HTTP 401）` | key 不完整 / 多了空格 / 已失效 / **网关不对** | 先 `npm run check-key`；国内站 key 用 `api.agnes-ai.cn`，国际站用 `apihub.agnes-ai.com` |
| `生成太快了，稍等几秒` | 2.5s 内连点 | 等几秒 |
| `Agnes 请求失败：HTTP 429` | 超 RPM | 脚本会自动重试；调大 `--interval` |
| 书封是渐变色块 | 还没有对应 png | 跑 `npm run images -- --covers` |

## 6. 代码位置

| 文件 | 作用 |
|---|---|
| `apps/web/lib/agnes.ts` | 读 key、调接口、429 退避、下载图片 |
| `apps/web/lib/generated-art.ts` | 落盘路径、URL（带 mtime 防缓存）、提示词 |
| `apps/web/app/api/images/route.ts` | 按需生成接口 |
| `apps/web/components/ChapterArt.tsx` | 阅读页插图 / 生成按钮 |
| `apps/web/scripts/generate-images.ts` | 批量生成 CLI（书封 / 章节） |
| `apps/web/scripts/generate-one.ts` | 单张出图 CLI（任意 prompt） |
| `apps/web/scripts/check-agnes.ts` | key 可用性探测（空 body，不花配额） |
