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
  },
});
