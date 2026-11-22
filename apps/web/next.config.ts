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
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Browsers only honour this over https, so it does nothing on the local http dev server.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // The safe part of a content policy: no framing by other sites, no <base> or <object> tricks,
          // and forms can only post back to this site. Scripts and styles are left open because Next.js
          // needs inline scripts and the Cloudflare check loads from challenges.cloudflare.com.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
