"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) ?? "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("er-theme", next);
    } catch {
      // 隐私模式下写不了 localStorage，忽略
    }
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
      title={theme === "dark" ? "浅色" : "深色"}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
