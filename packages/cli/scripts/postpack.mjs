// Runs automatically after `npm pack` / `npm publish`. Restores the source
// package.json that prepack stashed.
import { existsSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "..", "package.json");
const backupPath = resolve(here, "..", ".package.json.original");

// Write to stderr so we don't pollute `npm pack --json` output.
if (existsSync(backupPath)) {
  renameSync(backupPath, pkgPath);
  console.error("postpack: restored source package.json");
} else {
  console.error("postpack: no backup found — package.json may be in stripped state");
}
