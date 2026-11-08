# Storyrung

英语分级阅读（web 端 M0）

[![CI](https://github.com/jokerpast-bool/storyrung/actions/workflows/ci.yml/badge.svg)](https://github.com/jokerpast-bool/storyrung/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

按词汇量分级（四级 / 六级）推荐公版英文书，**每一章先练后读**：把这一章里"你不认识"的词、短语、长难句挑出来练，达标后再读原文，读完回流到复习队列。

当前是可运行的纵向切片（M0），不是完整产品。

> 仓库里只有代码（约 350 KB）：书籍原文、Gutenberg 目录、管线产物和 SQLite 库都在 `.gitignore` 里，首次运行按「快速开始」跑一遍管线即可重建。

## 快速开始

```bash
# 1) 安装依赖（本机 npm 缓存必须在项目内，否则会被沙箱拒绝）
npm install --ignore-scripts --cache ./.npm-cache

# 2) 建库 + 灌内容（需要一次放宽的终端权限：Prisma 建表会启动辅助进程）
cd apps/web
node ../../node_modules/prisma/build/index.js db push --schema prisma/schema.prisma
node ../../node_modules/tsx/dist/cli.mjs prisma/seed.ts

# 3) 起开发服务器
node ../../node_modules/next/dist/bin/next dev -p 3100
```

打开 http://localhost:3100 。

内容管线（重新生成 `data/dist/*.json`）：

```bash
node content-pipeline/select.mjs   # 候选书名 → 从 Gutenberg 目录解析出书籍 ID（首次会下 21MB 目录）
node content-pipeline/build.mjs    # 下载正文 → 分章分句 → 词表标注 → 准入闸 → JSON
```

书单在 `content-pipeline/candidates.json`（109 个候选书名），解析结果写 `content-pipeline/books.json`。
加书只需要往 candidates 里加一行书名 + 作者，不用记 Gutenberg ID。

自检（验证"预习答题 → 掌握度 → 通关 → 复习队列"链路）：

```bash
cd apps/web
node ../../node_modules/tsx/dist/cli.mjs scripts/level-smoke.ts   # 出题 → 判分 → 估词汇量
node ../../node_modules/tsx/dist/cli.mjs scripts/smoke.ts         # 预习 → 通关 → 复习排期
node ../../node_modules/tsx/dist/cli.mjs scripts/reset-demo.ts    # 演示前恢复成新用户
```

单元测试（23 个用例，纯函数，不碰数据库）：

```bash
cd apps/web
node --import tsx --test lib/domain/level.test.ts lib/domain/coverage.test.ts lib/domain/prep.test.ts lib/domain/srs.test.ts
```

> 本机沙箱不允许启动带管道输出的子进程，所以上面这些命令（以及 `npm install`、`prisma db push`、`next dev`）都需要在放宽权限的终端里跑。

## 准入闸：两套 profile

阈值不是写死在页面里的，而是内容管线写进 `data/dist/gate.json`、页面读同一份：

| profile | 四级 | 六级 | 用途 |
|---|---|---|---|
| `calibrated`（默认） | 覆盖率 ≥ 94%、句均生词 ≤ 0.9 | ≥ 96.5% / ≤ 0.7 | 由实测校准，书库有书可读 |
| `strict` | ≥ 97% / ≤ 0.5 | ≥ 98% / ≤ 0.4 | 产品最初写的硬指标，给改写版做验收 |

校准模式另有一个**挑战区**（只在 `calibrated` 下存在）：四级 ≥ 92.5% / 句均生词 ≤ 1.6，六级 ≥ 94% / ≤ 1.4。
这些书"能读但会卡"，单独一档并强制建议先做预习——而不是把它们混进推荐区、或者偷偷把主闸调低。

```bash
GATE_PROFILE=strict node content-pipeline/build.mjs   # 严格模式：全部书被挡下
node content-pipeline/build.mjs                        # 回到默认校准模式
```

严格模式下 0 本通过 —— 这不是 bug，是"未改写文本达不到舒适区"的证据，也正是改写工厂存在的理由。

## 已实现（M0）

| 模块 | 状态 | 说明 |
|---|---|---|
| 内容管线 | ✅ | Gutenberg 下载 → 分章/分句/分词 → 词形还原 → 词频段 → 准入闸 → JSON |
| 数据层 | ✅ | Prisma + SQLite，12 张表；结构化字段用 JSON 字符串（M1 迁 PG 时换 Json/enum） |
| 词汇量测评 | ✅ | 看词选义（四选一 + 不认识），6 个词频段 × 4 题，扣猜对率后估词汇量并定级 |
| 书库推荐 | ✅ | 按**你这一个人**的覆盖率显示"预计生词数"，不通过准入闸的书单独列出 |
| 准入闸 | ✅ | 四级 94%/句均生词 ≤0.9、六级 96.5%/≤0.7、硬底线 93%（阈值由实测校准） |
| 章前预习 | ✅ | 每章 ≤12 词 + ≤4 短语 + ≤3 长难句；四选一、掌握度、通关 |
| 阅读器 | ✅ | 分句渲染、点词查义（自动标记为不认识）、进度记忆、字号调节、粘性工具条 |
| 复习 | ✅ | FSRS-lite 排期、四档评分；预习通关时自动把弱词入队 |
| 生词本 | ✅ | 按状态筛选（不认识 / 在学 / 已掌握）、掌握度与释义一览 |
| 主题与视觉 | ✅ | 浅色/深色（跟随系统 + 本地记忆）、生成式书封、骨架屏、自定义 404/错误页 |
| 登录 | ❌ | M0 固定 demo 用户（`demo@english-reading.local`） |
| 改写工厂 | 🟡 | DeepSeek 逐章改写 + 逐章缓存，已出 25 本、19 本过闸上架；剩余队列待余额恢复 |

### 视觉与交互说明

样式是手写 CSS（`app/globals.css` + `app/theme.css`），没有引 Tailwind。
评估过 [shadcn/ui](https://github.com/shadcn-ui/ui)、[Magic UI](https://github.com/magicuicomponents/magicui)、[Aceternity UI](https://github.com/aceternity/ui)：它们的组件全部依赖 Tailwind 工具类，接进来等于把现有样式层重写一遍，收益不划算。
实际采用 [lucide](https://github.com/lucide-icons/lucide)（图标，React 生态事实标准）+ 自建设计系统：

- **书封**：按书名哈希生成渐变 + 首字母，零图片资源、零版权风险；
- **暗色模式**：CSS 变量覆盖 + `data-theme`，首屏内联脚本防闪烁；
- **动效**：只在 hover/切页做 150~250ms 过渡，不引动画库（避免首屏体积）。

## AI 书封与插图（Agnes）

书封和章节插图由 Agnes Image 2.5 Flash 生成，key 从本地文件读（默认 `~/.dsh/secrets/agnes.key`），不进代码也不入库：

```bash
npm run images -- --covers           # 可读书目的书封
npm run images -- --chapter <slug> 1 # 单章插图
```

生成结果落在 `apps/web/public/generated/`（已 gitignore）；没有图的书写封自动退回渐变色块。详见 [docs/AGNES.md](docs/AGNES.md)。

## 内容数据现状（实测）

候选 109 本 → 目录命中 109 本 → 可读 28 本（9 本原文 + 19 本分级改写），21 本进「挑战区」，其余 54 本仍是原文未过闸：

| 分层 | 数量 | 代表 | 四级基准覆盖率 |
|---|---|---|---|
| 推荐（原文） | 9 | The Wonderful Wizard of Oz 95.0%、Alice's Adventures in Wonderland 94.5%、The Adventures of Jerry Muskrat 94.8%、The Adventures of Pinocchio 94.4%、Danny Meadow Mouse 94.1%、Old Mother West Wind 94.0% | ≥ 94% |
| 推荐（改写） | 19 | The Marvelous Land of Oz 94.7%、Reddy Fox 96.0%、Sammy Jay 96.1%、Daisy Miller 96.9%（六级）、Otto of the Silver Hand 97.3%（托福） | 目标档位 |
| 挑战 | 21 | Memoirs of Sherlock Holmes 93.4%、Black Beauty 93.5%、The Story of Doctor Dolittle 94.0%、Heidi 94.0%、The Story of the Amulet 92.8% | 92.5%~94% |
| 需改写 | 54 | Pride and Prejudice 92.1%、Jane Eyre 89.5%、Moby-Dick 85.7% | < 92.5% |

改写工厂：`content-pipeline/adapt.mjs` 用 DeepSeek 逐章改写、逐章缓存，`data/adapted/{cet4,cet6,toefl}/` 落稿，`build.mjs` 只接受「全本跑完」的改写稿，并按目标档位复检（四级 94%、六级 96.5%、托福 96%）。已完成 25 本（16 四级 / 5 六级 / 4 托福），19 本过闸上架；剩余队列因 DeepSeek 余额耗尽暂停。

**这组数字本身就是结论**：未改写的公版经典对 4500 词读者普遍落在 85%~95%，只有极少数儿童文学越过 94%。所以书库不是"只有两本"，而是"能直接读的只有九本"——其余 21 本要靠预习兜着读，54 本得先改写。

## 项目结构

```
apps/web/               Next.js 15 应用
  app/                  页面 + server actions
    library/            书库（推荐 / 挑战 / 需改写 + 等级筛选）
    vocab/              生词本（按状态筛选）
    book/[slug]/[chapter]/prep|read
    loading.tsx · not-found.tsx · error.tsx
  components/           PrepTrainer / Reader / ReviewTrainer / LevelTest / BookCover / ThemeToggle
  lib/domain/           纯函数：等级估计、覆盖率与准入、预习掌握度、SRS
  lib/services/         数据访问与业务编排（library / chapter / prep-session / review / level-test / user）
  lib/agnes.ts          Agnes 出图客户端（key 从 ~/.dsh/secrets/agnes.key 读）
  app/api/images/       按需生成书封 / 章节插图
  prisma/               schema.sqlite + seed.ts
  scripts/              smoke.ts · level-smoke.ts · reset-demo.ts · generate-images.ts
content-pipeline/       Node 内容管线
  candidates.json       候选书名（加书改这里）
  select.mjs            书名 → Gutenberg ID（目录匹配）
  books.json            解析结果（管线输入）
  build.mjs             分章分句 / 词表标注 / 准入闸
data/catalog/           Gutenberg 官方目录 CSV（21MB）
data/books/             Gutenberg 原文
data/dist/              管线产物（books / lemma-index / level-items / gate）
docs/ARCHITECTURE.md    架构设计
```

## 验证记录

| 项 | 结果 |
|---|---|
| 页面探测 | 8/8 路由返回 200，无运行时报错 |
| 类型检查 | `tsc --noEmit` 0 error |
| 单元测试 | 26/26 通过（等级估计 / 覆盖率与准入 / 预习掌握度 / SRS 排期） |
| 测评自检 | 24 题四选一：全对 → 8000 词（cet6），全错 → 500 词（cet4）；猜对率已扣除 |
| 链路自检 | 1 词先错后对 + 11 词答对 → prepScore 0.71、unlocked=true、prepStatus=passed、入队 1 张卡；评分 good 后排期 3 天、reps 0→1 |
| 严格模式 | `GATE_PROFILE=strict` → 109 本书 0 本通过（97%/0.5 硬指标生效） |

## 已知限制

- **词表来源**：释义与词频来自 ECDICT（MIT），短语只有内置 30 条动词短语表，还没有搭配挖掘。
- **章节标题**：有 CHAPTER/PART/ADVENTURE 标记的书能拿到真实章名；Sherlock 这类用裸罗马数字或独立小标题的书，会被按 ~3500 词切成「Chapter 1（1）」这样的通用分节名。
- **长难句**只有难度分与关键词，没有句法拆解（主干/从句），预习里是"先自己读一遍"。
- **没有登录**，多人使用会共享同一份 demo 数据。
- **SQLite** 单文件，适合本地；上线要换 PostgreSQL（schema 已按此预留）。109 本书的产物约 100MB，只有过闸的书才会落正文。
- 内容覆盖：候选 109 本 → 命中 109 本；加书改 `content-pipeline/candidates.json` 即可。

## 下一步（按优先级）

1. 登录 + 多用户（当前所有"个性化"逻辑已按 userId 参数化，接 Auth.js 即可）
2. 长难句句法拆解（spaCy 依存 / LLM 离线预生成并缓存）
3. 批量选书：Gutenberg CSV → 覆盖率预筛 → 候选池
4. 改写工厂：公版书分级改写（`adapted: true`）+ 98% 目标复检
5. 迁移 PostgreSQL + 内容缓存层
