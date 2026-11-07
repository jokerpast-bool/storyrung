import Link from "next/link";
import { notFound } from "next/navigation";

import PrepTrainer from "@/components/prep/PrepTrainer";
import { getPrepView } from "@/lib/services/chapter";
import { effectiveVocabSize, getDemoUser, getKnownSet, getVocabStates } from "@/lib/services/user";

export const dynamic = "force-dynamic";

export default async function PrepPage({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter } = await params;
  const chapterIndex = Number(chapter);
  if (!Number.isFinite(chapterIndex)) notFound();

  const user = await getDemoUser();
  const [known, states] = await Promise.all([
    getKnownSet(user.id, effectiveVocabSize(user)),
    getVocabStates(user.id),
  ]);
  const view = await getPrepView(slug, chapterIndex, user.id, known, states);
  if (!view) notFound();

  const unlocked = view.progress.prepStatus === "passed" || view.progress.prepStatus === "skipped";

  return (
    <main>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="muted small">
            <Link href={`/book/${slug}`}>{view.chapter.bookTitle}</Link> · 第 {chapterIndex} 章
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>{view.chapter.title}</h1>
        </div>
        <div className="row">
          <span className="badge">{view.words.length} 词</span>
          <span className="badge">{view.phrases.length} 短语</span>
          <span className="badge">{view.hardSentences.length} 长难句</span>
        </div>
      </div>

      {unlocked && (
        <div className="note" style={{ marginBottom: 16 }}>
          {view.progress.prepStatus === "skipped" ? "已跳过" : "已通关"} ·
          <Link href={`/book/${slug}/${chapterIndex}/read`}> 去阅读 →</Link>
        </div>
      )}

      {view.words.length === 0 && view.phrases.length === 0 ? (
        <div className="empty">
          这章没有需要预习的词。
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" href={`/book/${slug}/${chapterIndex}/read`}>
              开始阅读 →
            </Link>
          </div>
        </div>
      ) : (
        <div className="prep-layout">
          <PrepTrainer
            chapterId={view.chapter.id}
            bookSlug={slug}
            chapterIndex={chapterIndex}
            chapterTitle={view.chapter.title}
            words={view.words.map((w) => ({
              lemma: w.lemma,
              phonetic: w.phonetic,
              pos: w.pos,
              definitionZh: w.definitionZh,
              band: w.band,
            }))}
            phrases={view.phrases.map((w) => ({
              lemma: w.lemma,
              phonetic: w.phonetic,
              pos: w.pos,
              definitionZh: w.definitionZh,
              band: w.band,
            }))}
            options={view.options}
            hardSentences={view.hardSentences.map((s) => ({
              index: s.index,
              text: s.text,
              hardScore: s.hardScore,
              keyVocab: s.keyVocab,
            }))}
            initialScore={view.progress.prepScore}
            initialCoverage={view.currentCoverage}
            initiallyUnlocked={unlocked}
          />

          <aside className="stack">
            <div className="card flat">
              <div className="kv">
                <span>词数</span>
                <b>{view.chapter.wordCount}</b>
              </div>
              <div className="kv">
                <span>句子</span>
                <b>{view.chapter.sentenceCount}</b>
              </div>
              <div className="kv">
                <span>覆盖率</span>
                <b>{(view.currentCoverage * 100).toFixed(1)}%</b>
              </div>
              <div className="kv">
                <span>预计</span>
                <b>{view.chapter.estMinutes} 分钟</b>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
