import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
