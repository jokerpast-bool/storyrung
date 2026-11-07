"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <div className="empty" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 22, fontFamily: "var(--serif)", marginBottom: 8 }}>页面出错了</div>
        <div className="muted small" style={{ marginBottom: 16 }}>
          {error.message || "未知错误"}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn primary" onClick={reset}>
            重试
          </button>
          <Link href="/library" className="btn ghost">
            回书库
          </Link>
        </div>
      </div>
    </main>
  );
}
