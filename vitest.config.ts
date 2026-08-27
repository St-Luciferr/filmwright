import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/engine/test/**/*.test.ts",
      "apps/studio/test/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      // The studio's `@/` path alias, mirrored from apps/studio/tsconfig.json.
      "@/": `${path.resolve(here, "apps/studio")}/`,
      // The workspace package, resolved straight to source the way tsx does.
      "@filmwright/engine/types": path.resolve(here, "packages/engine/src/types.ts"),
      "@filmwright/engine": path.resolve(here, "packages/engine/src/index.ts"),
    },
  },
});
