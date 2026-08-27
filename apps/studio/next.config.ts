import type { NextConfig } from "next";

const config: NextConfig = {
  // The engine is shipped as TypeScript source inside the workspace.
  transpilePackages: ["@filmwright/engine"],
  experimental: {
    // Job records and rendered videos live outside the app directory.
    externalDir: true,
  },
  // Nothing gained by announcing the framework version.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The studio renders model-written text and serves model-written
          // files; a sniffed content type is one more way that becomes markup.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing here is meant to be embedded, and framing an
          // unauthenticated local tool is how clickjacking gets its clicks.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default config;
