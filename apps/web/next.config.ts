import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// 'self' means the address the visitor is on, so this one policy is right for every domain of the site.
// Scripts and styles keep 'unsafe-inline' because Next.js writes small inline scripts for itself and the pages use
// inline styles. Everything else is closed: no other script host, no other place to send data, no plugins, no
// framing by other sites, forms post only to this site. If a script were ever injected, it could not load code
// from another site or send the sign-in token to one.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The pages call the API on their own address (/api), so 'self' covers it on every domain.
  `connect-src 'self' https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`,
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

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
        // API answers change with the data. Pages themselves stay cacheable so the desk menu can open at once.
        source: "/api/((?!public/brand).*)",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" }],
      },
      {
        // Logo and favicon URLs change when the picture changes, so the browser can keep a copy.
        source: "/api/public/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
