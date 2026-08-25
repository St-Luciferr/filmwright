import type { NextConfig } from "next";

const config: NextConfig = {
  // The engine is shipped as TypeScript source inside the workspace.
  transpilePackages: ["@filmwright/engine"],
  experimental: {
    // Job records and rendered videos live outside the app directory.
    externalDir: true,
  },
};

export default config;
