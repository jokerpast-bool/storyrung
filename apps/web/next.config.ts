import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // 用 127.0.0.1 访问时，Next 会提示跨源请求 /_next/*；列出来就不再警告。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 开发态左下角的 Next 徽标会压住书架首本封面，关掉。
  devIndicators: false,
};

export default nextConfig;
