import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@uniqpay/types"],
  async rewrites() {
    const api = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|icon.svg).*)",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
