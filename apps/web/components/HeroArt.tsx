/**
 * 首页右侧的线描书：零图片资源，纯 SVG 描边，跟随主题色。
 * 几枚漂浮字母呼应 "story / rung" 的拼读感。
 */
export default function HeroArt() {
  return (
    <svg
      className="hero-art-svg"
      viewBox="0 0 360 240"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="hero-art-book">
        {/* 左页 */}
        <path d="M180 148c-42-8-86 0-114 18" />
        <path d="M66 166c-2 10-2 22 0 32" />
        <path d="M66 198c40-14 84-18 114-8" />
        {/* 右页 */}
        <path d="M180 148c42-8 86 0 114 18" />
        <path d="M294 166c2 10 2 22 0 32" />
        <path d="M294 198c-40-14-84-18-114-8" />
        {/* 书脊 */}
        <path d="M180 148v42" />
        {/* 左页行线 */}
        <path d="M178 160c-28-5-62 0-90 13" opacity="0.55" />
        <path d="M178 171c-28-5-62 0-90 13" opacity="0.38" />
        <path d="M178 182c-28-5-62 0-90 13" opacity="0.22" />
        {/* 右页行线 */}
        <path d="M182 160c28-5 62 0 90 13" opacity="0.55" />
        <path d="M182 171c28-5 62 0 90 13" opacity="0.38" />
        <path d="M182 182c28-5 62 0 90 13" opacity="0.22" />
        {/* 书页厚度 */}
        <path d="M66 198c0 3 0 5 1 7" opacity="0.45" />
        <path d="M294 198c0 3 0 5-1 7" opacity="0.45" />
      </g>
      <g className="hero-art-letters" stroke="none">
        <text x="292" y="96" fontSize="26">s</text>
        <text x="320" y="66" fontSize="15">P</text>
        <text x="258" y="70" fontSize="13">b</text>
      </g>
    </svg>
  );
}
