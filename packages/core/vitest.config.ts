import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@crimes/language-js": resolve(__dirname, "../language-js/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // scan() now builds an import graph + scoring context per invocation
    // (0.6.0 §4.1, §4.4), each of which can spawn a git subprocess on git
    // repos. The default 5s timeout is borderline under the test suite's
    // parallelism contention; bumping to 30s removes the flake without
    // hiding any real perf regression — long-running tests still surface.
    testTimeout: 30_000,
  },
});
