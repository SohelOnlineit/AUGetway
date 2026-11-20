import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Directives that cannot break page scripts or styles: no plugins, no <base> hijack,
  // forms only post back to this site, and only this site may frame the pages.
  {
    key: "Content-Security-Policy",
    value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@amarpin/types"],
  // Dev server is opened by IP from other networks, not only localhost.
  allowedDevOrigins: ["103.114.38.220"],
  experimental: {
    // Base64 of a 10 MB image is larger than Next's default 10 MB clone limit.
    proxyClientMaxBodySize: "16mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
