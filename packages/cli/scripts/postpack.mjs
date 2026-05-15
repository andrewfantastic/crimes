// Runs automatically after `npm pack` / `npm publish`. Restores the source
// package.json that prepack stashed.
import { existsSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "..", "package.json");
const backupPath = resolve(here, "..", ".package.json.original");

if (existsSync(backupPath)) {
  renameSync(backupPath, pkgPath);
  console.log("postpack: restored source package.json");
} else {
  console.warn("postpack: no backup found — package.json may be in stripped state");
}
