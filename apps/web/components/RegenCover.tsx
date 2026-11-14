"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 书详情页的"换封面"按钮：让 Agnes 按当前风格重画一张，然后刷新页面。 */
export default function RegenCover({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "cover", slug, force: true }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "生成失败");
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cover-regen">
      <button type="button" className="btn ghost" onClick={run} disabled={busy}>
        {busy ? "正在画…" : "换封面"}
      </button>
      {error && <span className="cover-regen-error">{error}</span>}
    </div>
  );
}
