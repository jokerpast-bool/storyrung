import Link from "next/link";
import { notFound } from "next/navigation";

import Reader from "@/components/reader/Reader";
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

  return (
    <>
      {needsPrep && (
        <div className="note warn" style={{ marginTop: 12 }}>
          这一章还没预习 · <Link href={`/book/${slug}/${chapterIndex}/prep`}>先练生词 →</Link>
        </div>
      )}
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
