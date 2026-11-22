import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Where this site's own pages may talk to. Only the API and Cloudflare Turnstile are outside the site itself.
function apiOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100/api").origin;
  } catch {
    return "";
  }
}

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
  `connect-src 'self' ${apiOrigin()} https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`.replace(/\s+/g, " ").trim(),
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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
