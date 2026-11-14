# Storyrung — 英语分级阅读训练网站（架构设计）

> 版本 v0.1 ｜ 目标形态：先做 Web 端（桌面优先，移动端自适应）｜ 当前工作区：`D:\桌面\github\英语阅读`

---

## 0. 产品定位（一句话）

按用户词汇量分为 **四级 / 六级** 两档，推荐匹配难度的英文书籍；**每一章先练后读**——把该章里"这个用户不认识"的词、短语、长难句挑出来做成训练，达标后再进入原文章节阅读。

差异化不在"书多"，而在**个性化预处理**：
- 同一本书、同一章，不同用户看到的预习包不同（取决于他的词汇掌握状态）；
- 预习是**可量化的通关门**，不是可选的小贴士；
- 读完回流到 SRS 复习，形成"预习 → 阅读 → 复习"闭环。

---

## 1. 用户旅程与页面地图

```
落地页
  └─ 注册 / 登录
       └─ 等级测评（词汇量量化） ── 也可跳过，直接自报四级/六级
            └─ 书库推荐（按 level + 词汇覆盖率排序）
                 └─ 书籍详情 + 章节目录（每章：词数 / 生词数 / 预计时长 / 预习状态）
                      └─ 章节预习（单词 → 短语 → 长难句 → 通关判定）
                           └─ 阅读器（点词查义 / 分句翻译 / 朗读 / 高亮 / 进度记忆）
                                └─ 章末小测 + 生词入复习队列
                                     └─ 复习中心（SRS 到期卡片 / 错词本 / 统计）
```

| 路由 | 页面 | 关键交互 |
|---|---|---|
| `/` | 落地页 | 卖点、开始测评 CTA |
| `/onboarding/level-test` | 等级测评 | 3 选 1（认识/不确定/不认识），30~40 题，进度条，出分动画 |
| `/library` | 书库 | 等级切换、可读性徽标（"生词率 6%"）、筛选 |
| `/book/[bookId]` | 书籍详情 | 简介、章节表、继续阅读 |
| `/book/[bookId]/[chapterId]/prep` | **预习训练** | 卡片翻转、选择题、拼写、语境填空、长难句拆解、通关进度环 |
| `/book/[bookId]/[chapterId]/read` | **阅读器** | 双栏（正文 + 侧栏释义/笔记）、点词、句译开关、TTS、字号/行距、暗色 |
| `/review` | 复习中心 | 到期卡片、四档评分（Again/Hard/Good/Easy）、错词本 |
| `/me` | 个人中心 | 等级重测、词汇量曲线、阅读统计、生词本 |

---

## 2. 技术选型

| 层 | 选型 | 理由 | 备选 |
|---|---|---|---|
| 框架 | **Next.js 15（App Router）+ TypeScript** | 前后端同仓同语言，Route Handler 直接当 API；阅读页 SSR/流式首屏好；后续可拆 | Remix、Nuxt |
| UI | **Tailwind CSS v4 + shadcn/ui（Radix）** | 阅读器需要精细控制字号/行距/主题，原子类最省事；组件可复制可控 | MUI、Chakra |
| 数据请求 | **TanStack Query** + Server Actions | 缓存/重试/乐观更新开箱即用；阅读器进度、查词要乐观更新 | SWR |
| 客户端状态 | **Zustand** | 阅读器局部 UI 状态（面板宽度、当前句、高亮）不值得进全局 store | Context |
| 数据库 | **PostgreSQL 16**（开发期可 SQLite） | JSONB 存分词/句法结构；SRS 并发；后续全文检索 | MySQL |
| ORM | **Prisma** | 类型安全、迁移友好、seed 方便 | Drizzle |
| 认证 | **Auth.js（NextAuth v5）Credentials** | 邮箱+密码够用，预留 OAuth/微信 | 自研 JWT |
| 内容管线 | **Node 脚本离线批处理**（ECDICT 词表 + BNC lemma 表，`content-pipeline/build.mjs`） | 分词/词形还原/词频/释义一套词表就够，且与 web 端同语言、零额外运行时；离线跑一次，产物入库 | Python spaCy（句法拆解阶段再引入） |
| 词典数据 | 开源释义（ECDICT 中文释义 + 音标）+ COCA/NGSL 词频 | 免授权费，中文学习者友好；可增量替换 | 商用词典 API |
| TTS | 浏览器 **Web Speech API**（MVP）→ 后期云端 TTS 预生成音频 | 零成本、零延迟起步 | Azure TTS |
| 测试 | Vitest（单测）+ Playwright（E2E） | 预习通关、SRS 排期这类逻辑必须有单测 | — |
| 部署 | Docker Compose（web + pg） | 本地一键起；后续再上云 | Vercel + Neon |

**为什么是单体而不是前后端分离**：web 端先行、单人/小团队、领域逻辑集中在"预习与词汇状态"，一套 TS 类型贯穿前后端能省掉大量契约维护成本。等要做 App 或内容管线扩容，再把 `packages/shared` 抽成独立服务。

---

## 3. 总体架构

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器（React 19 / Next.js App Router）                      │
│  ┌────────────┬────────────┬────────────┬─────────────────┐  │
│  │ 测评向导    │ 书库推荐    │ 预习训练    │ 阅读器 / 复习     │  │
│  └────────────┴────────────┴────────────┴─────────────────┘  │
│  TanStack Query（server state） + Zustand（reader UI state）  │
└───────────────────────────┬──────────────────────────────────┘
                            │ fetch / Server Action（zod 校验）
┌───────────────────────────▼──────────────────────────────────┐
│  Next.js Route Handlers（app/api/**）— 只做校验与编排          │
├──────────────────────────────────────────────────────────────┤
│  领域服务层 lib/services/**（纯 TS，可单测）                   │
│  level · recommendation · prep · reader · vocab · srs · stats │
├──────────────────────────────────────────────────────────────┤
│  数据访问层 lib/db（Prisma）+ lib/cache（内存 LRU → Redis）    │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        │ PostgreSQL                              │
        │ users / books / chapters / vocabulary   │
        │ sentences / user_vocab_state / progress │
        │ attempts / review_cards                 │
        └───────────────────▲────────────────────┘
                            │ seed（幂等 upsert）
        ┌───────────────────┴────────────────────┐
        │ 内容管线 content-pipeline（Node，离线） │
        │ ingest → clean → segment → NLP 标注      │
        │ → 章节 JSON → prisma seed               │
        └─────────────────────────────────────────┘
```

三条硬边界：
1. **API 层薄**：route handler 里不写业务，只 `parse(zod) → service() → json()`。
2. **领域逻辑纯函数化**：等级估计、覆盖率、解锁判定、SRS 排期放 `packages/shared/`，前端可预览、后端可复用、可单测。
3. **内容与用户状态分离**：书籍/章节/词条是"内容"，`user_vocab_state` 是"个性"，两者通过查询时 join 得到"这个用户的生词表"，绝不把用户状态写回内容表。

---

## 4. 数据模型

### 4.1 核心表

**users**（学习者）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | |
| email / passwordHash | text | argon2 |
| level | enum(`cet4`,`cet6`,`unknown`) | 当前等级 |
| vocabSize | int | 估计词汇量 |
| levelConfidence | float | 测评置信度 0~1 |
| createdAt / updatedAt | timestamp | |

**level_assessments**（测评记录，可重测）
| 字段 | 类型 | 说明 |
|---|---|---|
| id, userId | | |
| items | jsonb | 抽题快照 `[{lemma, band, answer, correct}]` |
| estimatedVocab, level, confidence | | 结果 |
| createdAt | | 词汇量曲线来自这张表 |

**books**
| 字段 | 类型 | 说明 |
|---|---|---|
| id, slug, title, author | | |
| level | enum(`cet4`,`cet6`) | 目标等级 |
| wordCount, chapterCount | int | |
| difficulty | float | 管线计算的难度分（词频加权） |
| license, sourceUrl | text | **合规必填**（`public-domain` / `licensed` / `user-provided`） |
| coverUrl, description | | |

**chapters**
| 字段 | 类型 | 说明 |
|---|---|---|
| id, bookId, index, title | | |
| wordCount, sentenceCount | int | |
| difficulty, estMinutes | float/int | 预计阅读时长 |
| textPath | text | 或直接 text（小体量） |

**chapter_vocabulary**（章节级知识点：词与短语）
| 字段 | 类型 | 说明 |
|---|---|---|
| id, chapterId | | |
| lemma / phrase | text | 短语时填 phrase，lemma 为空 |
| kind | enum(`word`,`phrase`) | |
| surfaceForms | text[] | 本章出现的变形 |
| pos, phonetic, definitionZh, exampleSentence | | |
| freqRank | int | COCA 排序，越小越常见 |
| band | enum(`cet4`,`cet6`,`beyond`) | 考纲归属 |
| importance | float | 0~1，见 §5.3 |
| occurrenceCount | int | 本章出现次数 |

**chapter_sentences**（长难句与正文结构）
| 字段 | 类型 | 说明 |
|---|---|---|
| id, chapterId, index | | 全章句子按序 |
| text | text | 原句 |
| tokens | jsonb | `[{surface, lemma, start, end, vocabId?}]`，前端点词靠它定位 |
| translation | text? | 中文（预生成或 LLM 增强） |
| syntax | jsonb? | `{main:{...}, clauses:[{type,text,role}]}` 拆解结果 |
| hardScore | float | 长难句分（句长/从句数/逗号密度） |
| keyVocabIds | text[] | 句中核心词 |

**user_vocab_state**（个性化核心，`@@unique([userId, lemma])`）
| 字段 | 类型 | 说明 |
|---|---|---|
| userId, lemma | | |
| status | enum(`unknown`,`uncertain`,`learning`,`known`) | |
| mastery | float | 0~1，训练与复习共同更新 |
| source | enum(`test`,`click`,`exercise`,`review`,`manual`) | 最近一次来源 |
| firstSeenAt, lastSeenAt | | |
| dueAt, intervalDays, ease | | SRS 排期字段 |

**chapter_progress**
| 字段 | 类型 | 说明 |
|---|---|---|
| userId, chapterId | | 唯一 |
| prepStatus | enum(`locked`,`in_progress`,`passed`,`skipped`) | |
| prepScore | float | 通关时的掌握度 |
| position | jsonb | `{sentenceIndex, scrollTop}` 进度记忆 |
| lookupCount, readingSeconds | int | 查词次数是"难度反馈"信号 |
| completedAt | | |

**attempts**（所有作答，训练/小测/复习共用）
| 字段 | 类型 | 说明 |
|---|---|---|
| id, userId, vocabId?, exerciseType | | `recognize`/`spell`/`cloze`/`listen` |
| correct | bool, latencyMs | |
| chapterId?, createdAt | | 用于统计与难度回归 |

**review_cards**（SRS）
| 字段 | 类型 | 说明 |
|---|---|---|
| userId, lemma | | 唯一 |
| state, dueAt, stability, difficulty, lapses | FSRS-5 字段 | |
| reps, lastReviewAt | | |

### 4.2 Prisma 片段（关键约束）

```prisma
model UserVocabState {
  id        String   @id @default(uuid())
  userId    String
  lemma     String
  status    VocabStatus @default(uncertain)
  mastery   Float    @default(0.3)
  source    VocabSource
  dueAt     DateTime?
  ease      Float    @default(2.5)
  intervalDays Float @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, lemma])
  @@index([userId, status])
  @@index([userId, dueAt])
}

model ChapterProgress {
  userId       String
  chapterId    String
  prepStatus   PrepStatus @default(locked)
  prepScore    Float?
  position     Json?
  lookupCount  Int      @default(0)
  readingSeconds Int    @default(0)
  completedAt  DateTime?

  @@id([userId, chapterId])
}
```

---

## 5. 关键算法

### 5.1 等级测评（词汇量量化）

- **题库**：6 个频段（1-2000 / 2001-3000 / 3001-4000 / 4001-5000 / 5001-6000 / 6001-8000，COCA 排名），每段 40 个词，共 240 个；由 `content-pipeline/level-items.mjs` 从 ECDICT 分层抽样生成，避开功能词、专有名词、粗俗词与重复释义。
- **作答**：看词选义，四选一 + 「不认识，跳过」；每场每段随机抽 4 个，共 24 题，重测不重样。选完立刻高亮正确答案（0.9s 后进下一题），和扇贝一致。
- **估计**：`p_b = (答对 − 0.25 × 题数) / (0.75 × 题数)`（扣掉四选一的蒙对率），`vocabSize ≈ Σ (段宽 × p_b)`，段内线性插值。
- **映射**：`< 4500 → cet4`，`≥ 4500 → cet6`（CET-4 大纲约 4500 词、CET-6 约 5500~6000）。
- **置信度**：答满 24 题的段数 × 答题时长 → `confidence`；`confidence < 0.6` 时结果页提示"可以再测一次"。
- **升级路径**：留 `irt` 策略位（题目难度=词频秩，1PL + 后验均值），MVP 用加权法即可，接口不变。

### 5.2 准入闸与可读性（已按实测修正）

```
coverage(book, user) = |{token ∈ book : knownOrLearning(user, lemma(token))}| / |tokens|
```

**准入闸是硬约束，不是软打分**——不达标的书不进书库，只进"需改写"队列：

| 等级 | 覆盖率 | 句均生词 | 硬底线 |
|---|---|---|---|
| 四级 | ≥ 94% | ≤ 0.9 | 93% |
| 六级 | ≥ 96.5% | ≤ 0.7 | 93% |

阈值怎么来的（不是拍脑袋）：
- 文献锚点：Hu & Nation (2000) 95% 才"勉强可读"，Nation (2006) 98% 才"舒适"；
- 实测：公版书对 4500 词基准读者的覆盖率是 Alice 94.4%、Oz 94.9%、P&P 92.0%，句均生词 0.82；
- 原先设的 **97%/0.5 会让一本书都进不来**，所以四级线定 94%、六级线定 96.5%，98% 留给改写版做目标。

**两套 profile 并存**（`GATE_PROFILE` 切换，管线写 `data/dist/gate.json`，页面读同一份，避免"判定用一套数字、显示用另一套"）：

| profile | 四级 | 六级 | 实测结果 |
|---|---|---|---|
| `calibrated`（默认） | 94% / 0.9 | 96.5% / 0.7 | 2 本通过、1 本进改写队列 |
| `strict` | 97% / 0.5 | 98% / 0.4 | **0 本通过**——未改写文本达不到舒适区的直接证据 |

两处常被混淆：**书级准入**（离线、对基准读者算）与**用户级可读性**（在线、对这个人的词汇状态算）。书库卡片显示的百分比是后者。

- 冷启动（无词汇状态）：用 `level` 对应的词汇量基线当作已知集合（四级 4500 / 六级 6000）。
- 展示：不给"匹配度 87%"这种数字，直接给 **"预计生词 603 个 / 覆盖率 94.4%"**。

### 5.3 未知词判定（"这个用户不认识的词"）

| 信号 | 结果 |
|---|---|
| 测评答错该词 | `unknown` |
| 测评答对 / 追问答对 | `known` |
| 训练连续答对 | `mastery↑`，≥0.8 → `learning/known` |
| 阅读中**点击查词** | `unknown`（强信号） |
| 阅读中多次出现且从未查询 | 弱证据，`mastery` 小幅上调 |
| 用户手动标记"我认识" | `known`，并降低后续出现权重 |
| 无记录 | 落在考纲内 → 视为 `uncertain`（默认不打扰，只在预习包里低优先级出现）；考纲外 → `unknown` |

```
chapterUnknowns = chapter_vocabulary
  WHERE (kind='word' AND status(lemma) ∈ {unknown, uncertain})
     OR (kind='phrase' AND phrase 未出现在 user 已掌握短语集)
  ORDER BY importance DESC, occurrenceCount DESC
```
`importance = 0.5·freqWeight + 0.3·cetBandWeight + 0.2·inSentenceKeyWeight`

### 5.4 预习通关（已按实测修正）

- 每个知识点有 `mastery ∈ [0,1]`。**实测踩到的坑**：原来用 `+0.15·(1-m)` 的小步长，每个词只问一次，12 个词全答对也只能到 0.41，永远解锁不了——所以改成"首次答对给一大步、再练给小步"：
  - 首次答对（`mastery ≤ 0.35`）：`+0.6·(1-m)` → 0.3 起步一步到 0.72
  - 再练答对：`+0.15·(1-m)`；答错：腰斩（0.3 → 0.15）；反应 < 1.2s 加成打 6 折（防猜）
- 题型：`recognize`（选中文义，已实现）→ `cloze` / `spell`（M1）。
- 规模控制：一章 **≤ 12 个核心词 + ≤ 4 短语 + ≤ 3 长难句**（实测 20 词会让预习超过 5 分钟）。
- **通关条件**：核心词平均掌握度 ≥ 0.70 即解锁。
  - 覆盖率**不再**作为硬门槛：12 个词对整章覆盖率的抬升只有 0.5~1 个百分点，拿它卡门等于永远不通关；覆盖率改为页面上的难度参考。
  - 用户可点"跳过预习，直接读" → `prepStatus = skipped`（记录事件用于调阈值）。
- 通关后：没掌握牢的核心词自动进复习队列（`review_cards`），形成闭环。

### 5.5 SRS 复习

- 卡片粒度：`lemma`（词）与 `phrase`（短语）两类，来自章节预习中答错/低掌握度的条目。
- 算法：**FSRS-5**（开源，权重可训练）或降级 SM-2；评分 Again/Hard/Good/Easy。
- 队列：`dueAt <= now` 优先；单次复习上限 50 张，按章节聚类（"复习第 3 章的词"）。

---

## 6. API 契约（Route Handlers）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/level-test/start` | 返回抽好的题目（不含答案） |
| POST | `/api/level-test/submit` | 判分 → `{vocabSize, level, confidence}`，写 `users` |
| GET | `/api/me` | 用户 + 等级 + 统计摘要 |
| GET | `/api/books?level=&sort=readability` | 含每人 `coverage`、`estUnknownRate` |
| GET | `/api/books/:id` | 详情 + 章节表（每章生词数、预习状态、进度） |
| GET | `/api/chapters/:id/prep` | **个性化预习包**（已按用户未知过滤+排序） |
| POST | `/api/chapters/:id/prep/attempt` | 记录作答 → 返回新 `mastery` 与 `unlocked` |
| POST | `/api/chapters/:id/prep/skip` | 跳过预习 |
| GET | `/api/chapters/:id/content` | 分句结构 + tokens + 可选翻译 |
| POST | `/api/vocab/lookup` | 点词查询：返回词条 + 标记 `unknown` |
| POST | `/api/vocab/:lemma/status` | 手动改状态（我认识 / 加入生词本） |
| POST | `/api/progress` | 上报阅读位置、时长、查词次数（防抖批量） |
| POST | `/api/chapters/:id/quiz` | 章末 3 题理解小测 |
| GET | `/api/review/due` / POST `/api/review/:id/grade` | SRS |
| GET | `/api/stats` | 词汇量曲线、阅读时长、生词增长率 |

约定：所有入参出参走 `packages/shared/schemas`（zod），前端类型自动推导；错误统一 `{ok:false, error:{code,message}}`。

---

## 7. 目录结构

```
english-reading/
├─ apps/
│  └─ web/
│     ├─ app/
│     │  ├─ (marketing)/page.tsx
│     │  ├─ (auth)/login/ · signup/
│     │  ├─ onboarding/level-test/
│     │  ├─ library/
│     │  ├─ book/[bookId]/
│     │  │  ├─ page.tsx                 # 目录
│     │  │  └─ [chapterId]/
│     │  │     ├─ prep/page.tsx          # 预习训练
│     │  │     └─ read/page.tsx          # 阅读器
│     │  ├─ review/
│     │  ├─ me/
│     │  └─ api/**/route.ts
│     ├─ components/
│     │  ├─ ui/                          # shadcn 基础件
│     │  ├─ reader/                      # ReaderShell · SentenceBlock · WordPopover · Toolbar
│     │  ├─ prep/                        # VocabCard · SpellInput · ClozeItem · SyntaxBoard · ProgressRing
│     │  └─ library/                     # BookCard · LevelBadge · CoverageMeter
│     ├─ lib/
│     │  ├─ db.ts                        # Prisma client 单例
│     │  ├─ auth.ts
│     │  └─ services/                    # level · recommend · prep · reader · vocab · srs · stats
│     └─ prisma/schema.prisma · seed.ts
├─ packages/
│  └─ shared/
│     ├─ schemas/                        # zod 契约
│     └─ domain/                         # 纯算法：estimateLevel · coverage · isUnlocked · fsrs
├─ content-pipeline/
│  ├─ ingest/                            # 抽取、分章、清洗
│  ├─ nlp/                               # 分词·词形还原·频段·短语·句法
│  ├─ output/                            # chapters/*.json
│  └─ requirements.txt
├─ data/
│  ├─ wordlists/                         # coca-rank.csv · cet4.csv · cet6.csv · ngsl.csv
│  ├─ dictionaries/                      # ecdict 精简版
│  └─ books/                             # 公版书 txt
└─ docs/ARCHITECTURE.md
```

---

## 8. 内容管线

```
文本 → 抽取正文 → 分章 → 分句 → 分词+词形还原 → 频段/考纲标注
     → 短语候选 → 长难句打分 → 产物 JSON → prisma seed（幂等 upsert）
```

- **分章**：正则（`Chapter\s+[IVXLC\d]+`）+ 长度异常检测（某"章"超过 3 倍中位数就二次切分）。
- **分句**：`spaCy` 句界 + 缩写/引号修补；每句保留 `start/end` 字符偏移，前端点词靠偏移定位。
- **词形还原**：`lemma_` + 频率表回退；`surface → lemma` 映射表随章节一起落库，避免前端再算。
- **短语**：预置 phrasal-verb 词表（`look after`、`give in`）优先，再用依存搭配补候选，人工抽检。
- **长难句**：`hardScore = 0.4·norm(len) + 0.3·norm(clauses) + 0.2·norm(clauseDepth) + 0.1·norm(commaDensity)`。
- **产物 schema**（每章一个 JSON，id 稳定可复现）：
```json
{
  "bookSlug": "the-little-prince", "chapterIndex": 3, "title": "Chapter III",
  "words": [{"lemma":"conceited","surfaceForms":["conceited"],"pos":"adj","phonetic":"/kənˈsiːtɪd/",
             "definitionZh":"自负的","freqRank":8200,"band":"cet6","occurrenceCount":2}],
  "phrases": [{"phrase":"in spite of","definitionZh":"尽管","occurrenceCount":1}],
  "sentences": [{"index":12,"text":"...","tokens":[{"surface":"conceited","lemma":"conceited","start":34,"end":43}],
                 "hardScore":0.72}]
}
```
- **版权红线**：只入库公版书（Project Gutenberg）或自有/授权材料；牛津书虫、企鹅分级读物等**受版权保护，不能抓取分发**。`books.license` 字段强校验，seed 脚本拒绝无授权来源。

### 8.1 数据源清单（2026-10-29 本机实测）

| 源 | 授权 | 能否入库分发 | 实测 |
|---|---|---|---|
| **Project Gutenberg** | 美国公版；分发需剥离 PG 头尾与商标 | ✅ 可 | gutenberg.org 可达；`/cache/epub/{id}/pg{id}.txt` 可下（HTTP 206）；**搜索页禁止抓取** |
| Gutenberg 目录 CSV | 同上 | ✅ | `https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv` — 21 MB / 90,931 行，字段 `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves` |
| Standard Ebooks | 公版 + 精校（自有编辑成果 CC0） | ✅ 可（质量更好，数量少） | Atom feed 返回 401，需带浏览器 UA 或换 OPDS |
| Wikisource | 正文公版 / 协作内容 CC BY-SA | ✅ 可（需署名） | 未测 |
| LibriVox | 公版有声书（朗读本身也释出公版） | ✅ 可（做听力/跟读素材） | 未测 |
| Internet Archive | 混合：公版 + 借阅库 | ⚠️ 公版部分可，借阅部分不可 | 未测 |
| Open Library | 借阅（CDL） | ❌ 不可分发 | 未测 |
| VOA Learning English | 美国政府作品，原则 PD，个别第三方内容除外 | ⚠️ 逐条确认后可（现代非虚构最佳来源） | 未测 |
| Simple English Wikipedia | CC BY-SA | ✅ 可商用（署名 + 同协议） | 未测 |
| 牛津书虫 / 企鹅分级 / BBC Learning English | 版权 | ❌ 只能外链 | — |
| Z-Library / PDFDrive / OceanOfPDF | 盗版 | ❌ 明确不碰 | — |

**Gutendex（第三方 PG API）本机连接超时**，不要作为唯一入口；以官方 CSV 目录 + 单本下载为准。

### 8.2 公版判定的实务规则

- 中国：《著作权法》作者终生 + 死后 50 年；美国：1930 年前出版已公版（95 年滚动）。
- **最保守筛法：出版早于 1930 年 且 作者卒于 1955 年前** → 主要司法辖区全部过期，全球可分发。
- 中文**译本**另有译者著作权，不能抓中译本；英文原文 + 自己写的中文释义才安全。
- 公版书**改写**（分级简化）产生的新表达属于你的改编成果，可自持版权商用——这是把 19 世纪文学做成"四级可读"的合法路径，但需要 LLM 初改 + 人工校对，成本要计入 M5。

---

## 9. 里程碑

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M0 脚手架**（1~2 天） | Next.js + Prisma + PG(docker) + shadcn + 假数据 seed（2 本书、3 章） | `pnpm dev` 能跑通 登录→书库→目录→阅读 的假数据闭环 |
| **M1 测评与推荐** | 题库 seed、测评流程、等级映射、书库按 coverage 排序 | 测评 30 题出分；书库显示"生词率 x%"，切换等级结果变化 |
| **M2 预习训练** | 预习包 API、三种题型、掌握度更新、通关解锁 | 一章 15 个词可练完并解锁；刷新后状态不丢 |
| **M3 阅读器** | 分句渲染、点词查义、进度记忆、生词本 | 点任意词出释义并落 `unknown`；关页再开回到原句 |
| **M4 复习与统计** | FSRS 排期、复习中心、词汇量曲线 | 答错词次日进到期队列；统计页数据与 attempts 一致 |
| **M5 内容与打磨** | 管线扩到 10+ 本、TTS、移动端、暗色 | 一本书端到端跑通（测评→推荐→预习→阅读→复习） |

> 建议 M0~M2 先用 **2~3 本公版书 + 手工校对的一章**打通链路，再投入管线自动化——避免管线做完才发现数据模型不对。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **书籍版权** | 上线即侵权 | 只用公版/授权；`license` 字段强校验；商业化前法务过一遍 |
| 分词/释义质量 | 点词释义驴唇不对马嘴 | 用 ECDICT 多词性释义 + 句中 POS 消歧；高频错词建人工覆盖表 |
| 预习负担过重 | 用户跳过预习 → 核心卖点失效 | 单章 ≤20 词、分批、允许跳过并记录；A/B 调整阈值 |
| 用户虚报"认识" | 生词表失真 | 追问答义抽检；阅读中查词反推 `unknown` |
| 词汇状态冷启动 | 首次推荐不准 | 用考纲词表兜底；读 1~2 章后自动收敛 |
| LLM 成本/不稳定 | 释义与讲解质量波动 | LLM 只做离线增强并缓存；MVP 不依赖它 |

---

## 11. 待确认的三个决策

1. **书源**：只用公版书（Gutenberg），还是你已有教材/分级读物的授权文本？（决定解析器与合规方案）
2. **等级判定**：是否保留"跳过测评、直接自报四级/六级"？（建议保留，降低首屏流失）
3. **是否接 LLM** 生成中文释义/长难句讲解/章末理解题？（MVP 建议先用词典+规则，LLM 作为可插拔增强层）

---

## 附：下一步可直接开工的顺序

1. `pnpm create next-app` 起 M0，落 `prisma/schema.prisma`（本文 §4.1 全表）；
2. seed 一本书 3 章（手工 JSON，先不写管线）；
3. 页面按 书库 → 目录 → 阅读器 → 预习 的顺序做，先把"点词查义"这条最核心的手感调顺；
4. 再补测评与 SRS；管线最后自动化。
