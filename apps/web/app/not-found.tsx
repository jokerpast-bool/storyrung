import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <div className="empty" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 28, fontFamily: "var(--serif)", marginBottom: 8 }}>404</div>
        没有这一页。
        <div style={{ marginTop: 16 }}>
          <Link href="/library" className="btn primary">
            回书库
          </Link>
        </div>
      </div>
    </main>
  );
}
