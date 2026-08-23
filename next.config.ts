import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist"],
  transpilePackages: ["epubjs"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
