import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    SKIP_AUTH: process.env.SKIP_AUTH,
  },
};

export default nextConfig;
