const SKIP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on"]);

function initialsOf(title: string): string {
  const words = title
    .replace(/['’]/g, "")
    .split(/[^A-Za-z]+/)
    .filter((word) => word.length > 0 && !SKIP_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return "BK";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}

/**
 * 用书名生成 deterministic 的书封：同一条书目每次渲染颜色一致，
 * 不需要外部图片、也不会有版权问题。
 */
export default function BookCover({
  slug,
  title,
  emoji,
  size = "sm",
}: {
  slug: string;
  title: string;
  emoji: string;
  size?: "sm" | "lg";
}) {
  const hue = hueOf(slug);
  const background = `linear-gradient(150deg, hsl(${hue} 42% 46%), hsl(${(hue + 48) % 360} 48% 26%))`;

  return (
    <div className={`cover ${size === "lg" ? "lg" : ""}`} style={{ background }} aria-hidden>
      <span className="cover-emoji">{emoji}</span>
      <span className="cover-mark">{initialsOf(title)}</span>
    </div>
  );
}
