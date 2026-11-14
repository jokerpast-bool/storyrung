import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // 开发态左下角的 Next 徽标会压住书架首本封面，关掉。
  devIndicators: false,
};

export default nextConfig;
