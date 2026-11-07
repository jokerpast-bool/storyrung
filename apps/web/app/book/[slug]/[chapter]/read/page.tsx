import Link from "next/link";
import { notFound } from "next/navigation";

import ChapterArt from "@/components/ChapterArt";
import Reader from "@/components/reader/Reader";
import { chapterArtUrl } from "@/lib/generated-art";
import { getReaderView } from "@/lib/services/chapter";
import { effectiveVocabSize, getDemoUser, getKnownSet } from "@/lib/services/user";

export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter } = await params;
  const chapterIndex = Number(chapter);
  if (!Number.isFinite(chapterIndex)) notFound();

  const user = await getDemoUser();
  const known = await getKnownSet(user.id, effectiveVocabSize(user));
  const view = await getReaderView(slug, chapterIndex, user.id, known);
  if (!view) notFound();

  const needsPrep = view.prepStatus === "locked";
  const art = chapterArtUrl(slug, chapterIndex);

  return (
    <>
      {needsPrep && (
        <div className="note warn" style={{ marginTop: 12 }}>
          这一章还没预习 · <Link href={`/book/${slug}/${chapterIndex}/prep`}>先练生词 →</Link>
        </div>
      )}
      <ChapterArt
        bookSlug={slug}
        chapterIndex={chapterIndex}
        src={art}
        caption={`${view.chapter.bookTitle} · 第 ${chapterIndex} 章`}
      />
      <Reader
        chapterId={view.chapter.id}
        bookSlug={slug}
        bookTitle={view.chapter.bookTitle}
        chapterTitle={view.chapter.title}
        wordCount={view.chapter.wordCount}
        estMinutes={view.chapter.estMinutes}
        sentences={view.chapter.sentences.map((sentence) => ({
          index: sentence.index,
          text: sentence.text,
          tokens: sentence.tokens,
        }))}
        startPosition={view.position}
      />
    </>
  );
}
