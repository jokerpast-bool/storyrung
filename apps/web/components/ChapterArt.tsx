"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChapterArt({
  bookSlug,
  chapterIndex,
  src,
  caption,
}: {
  bookSlug: string;
  chapterIndex: number;
  src: string | null;
  caption?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "chapter", slug: bookSlug, index: chapterIndex }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (src) {
    return (
      <figure className="chapter-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <div className="chapter-art-empty">
      <button type="button" className="btn ghost" onClick={generate} disabled={busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <ImagePlus size={15} />}
        {busy ? "生成中…" : "给这一章配张插图"}
      </button>
      {error && <span className="muted tiny">{error}</span>}
    </div>
  );
}
