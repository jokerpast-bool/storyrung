import type { Metadata } from "next";
import Link from "next/link";

import ThemeToggle from "@/components/ThemeToggle";

import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "Storyrung · 分级英文原著阅读",
  description: "按词汇量分级、先练后读的英文原著阅读训练",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem('er-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">
              story<span>rung</span>
            </Link>
            <div className="nav-links">
              <Link href="/library">书库</Link>
              <Link href="/vocab">生词本</Link>
              <Link href="/level-test">测评</Link>
              <Link href="/review">复习</Link>
            </div>
            <ThemeToggle />
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
