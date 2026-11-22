import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Dev only: lets the local dev server work through a Cloudflare quick tunnel.
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  // Baseline browser protections for the admin and the public pages.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        // Onboarding consultation records voice answers: microphone allowed for this origin only.
        source: "/(onboarding|dashboard/onboarding)/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=()",
          },
        ],
      },
      {
        // Self-hosted website fonts (app/site/site-fonts.css): file names carry a content hash.
        source: "/fonts/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Admin screens and API answers stay out of search engines.
        source: "/(dashboard|login|api/builder)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: { root: path.resolve(__dirname, "..") },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};

export default nextConfig;
