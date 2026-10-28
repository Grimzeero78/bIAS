import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["pdf-parse", "mammoth", "z-ai-web-dev-sdk"],
};

export default nextConfig;
