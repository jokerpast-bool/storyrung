import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Gauge, NotebookPen, Repeat } from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";

import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "分级阅读 · English Reading",
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
              分级<span>阅读</span>
            </Link>
            <div className="nav-links">
              <Link href="/library">
                <BookOpen size={15} />
                书库
              </Link>
              <Link href="/vocab">
                <NotebookPen size={15} />
                生词本
              </Link>
              <Link href="/level-test">
                <Gauge size={15} />
                测评
              </Link>
              <Link href="/review">
                <Repeat size={15} />
                复习
              </Link>
            </div>
            <ThemeToggle />
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
