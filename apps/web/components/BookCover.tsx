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
 * 书封：有 AI 生成图就用图，没有就退回 deterministic 的渐变色块，
 * 保证任何一本书在任何时候都有封面可看。
 */
export default function BookCover({
  slug,
  title,
  emoji,
  size = "sm",
  src,
}: {
  slug: string;
  title: string;
  emoji: string;
  size?: "sm" | "lg";
  src?: string | null;
}) {
  const hue = hueOf(slug);
  const background = `linear-gradient(150deg, hsl(${hue} 42% 46%), hsl(${(hue + 48) % 360} 48% 26%))`;
  const className = `cover ${size === "lg" ? "lg" : ""}`;

  if (src) {
    return (
      <div className={`${className} has-art`} style={{ background }} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cover-art" src={src} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className={className} style={{ background }} aria-hidden>
      <span className="cover-emoji">{emoji}</span>
      <span className="cover-mark">{initialsOf(title)}</span>
    </div>
  );
}
