import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / WASM / process-spawning packages must stay outside the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "@sparticuz/chromium", "adm-zip", "pg", "pngjs", "pixelmatch"],
  // The preview iframe and the hosting proxy use other origins during development.
  allowedDevOrigins: ["*.e2b.app"],
  poweredByHeader: false,
  // /preview/<token>/ must keep its trailing slash so relative links inside generated sites resolve.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [{ source: "/projects", destination: "/studio/projects", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/((?!preview/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
