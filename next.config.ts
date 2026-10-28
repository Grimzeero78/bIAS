import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["pdfjs-dist", "mammoth", "z-ai-web-dev-sdk"],
};

export default nextConfig;
