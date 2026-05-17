// Verify the website build produced HTML for every expected page.
// Used in CI to catch broken sync-docs / Astro-config drift.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "..", "dist");

const required = [
  "index.html",
  "docs/index.html",
  "docs/agent-usage/index.html",
  "docs/configuration/index.html",
  "docs/scoring/index.html",
  "docs/ci/index.html",
  "docs/suppressions/index.html",
  "docs/explain/index.html",
  "docs/json-schema/index.html",
  "docs/skills/index.html",
  "docs/releasing/index.html",
  "docs/feedback/index.html",
  "docs/evals/index.html",
  "docs/finding-types/ia/index.html",
  "docs/finding-types/petty/index.html",
  "docs/releases/v0.4.0/index.html",
  "docs/releases/v0.5.0/index.html",
  "docs/releases/v0.6.0/index.html",
  "docs/releases/v0.7.0/index.html",
];

const missing = required.filter((p) => !existsSync(resolve(distDir, p)));
if (missing.length > 0) {
  process.stderr.write(`verify-build: missing pages\n  ${missing.join("\n  ")}\n`);
  process.exit(1);
}
console.log(`verify-build: all ${required.length} expected docs pages present`);
