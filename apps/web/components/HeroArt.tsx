/**
 * 首页右侧的线描书：零图片资源，纯 SVG 描边，跟随主题色。
 * 用一本摊开的书（两页 + 书脊 + 页内行线），几枚漂浮字母呼应 "story / rung" 的拼读感。
 */
export default function HeroArt() {
  return (
    <svg
      className="hero-art-svg"
      viewBox="0 0 360 240"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="hero-art-book" transform="translate(80 20) scale(10)" strokeWidth="0.11">
        {/* 书脊 */}
        <path d="M12 6.5v14" />
        {/* 左右两页外轮廓 */}
        <path d="M3 18.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        {/* 左页行线 */}
        <path d="M4.8 7.6c1.5-.6 3.2-.7 5.2-.3" opacity="0.55" />
        <path d="M4.8 10.4c1.5-.6 3.2-.7 5.2-.3" opacity="0.42" />
        <path d="M4.8 13.2c1.5-.6 3.2-.7 5.2-.3" opacity="0.26" />
        {/* 右页行线 */}
        <path d="M19.2 7.6c-1.5-.6-3.2-.7-5.2-.3" opacity="0.55" />
        <path d="M19.2 10.4c-1.5-.6-3.2-.7-5.2-.3" opacity="0.42" />
        <path d="M19.2 13.2c-1.5-.6-3.2-.7-5.2-.3" opacity="0.26" />
      </g>
      <g className="hero-art-letters" stroke="none">
        <text x="288" y="44" fontSize="22">s</text>
        <text x="318" y="28" fontSize="14">P</text>
        <text x="256" y="30" fontSize="12">b</text>
      </g>
    </svg>
  );
}
