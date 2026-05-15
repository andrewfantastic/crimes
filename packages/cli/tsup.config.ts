import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node18",
  // Bundle everything — workspace packages and external runtime deps —
  // into a single self-contained file. The published `crimes` package
  // has no runtime dependencies, so `npm install -g ./crimes-X.Y.Z.tgz`
  // works without any further resolution. Node built-ins (`node:fs`,
  // `node:path`, …) stay external by default under `platform: "node"`.
  noExternal: [/.*/],
  // Some bundled deps (commander, typescript) are CJS and assume CommonJS
  // globals — `require`, `__filename`, `__dirname` — exist at runtime. The
  // output is ESM, where they don't. We polyfill all three so esbuild's CJS
  // interop wrapper and TypeScript's runtime probes work.
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __pathDirname } from "node:path";',
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join("\n"),
  },
});
