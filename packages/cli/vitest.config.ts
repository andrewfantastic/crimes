import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // CLI tests spawn dist/index.js subprocesses (subprocess startup + git
    // operations + sub-second test work). Under parallel vitest workers
    // the default 5s timeout pushes timing-sensitive tests over the line
    // intermittently. Bumped to 30s for headroom.
    testTimeout: 30_000,
  },
});
