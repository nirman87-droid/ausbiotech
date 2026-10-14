import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The load check builds into its own folder so it never clashes with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // These packages load native files or WebAssembly at runtime, so Next.js
  // must leave them as normal Node modules instead of bundling them.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "pg"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
