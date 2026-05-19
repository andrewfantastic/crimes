// Runs automatically before `npm pack` / `npm publish`.
//
// Why: the published `crimes` package is fully self-contained (everything is
// bundled into dist/index.js by tsup), so devDependencies are dead weight in
// the published manifest — and worse, they contain `workspace:*` refs that
// npm cannot resolve. We strip them here and restore them in postpack.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, "..", "package.json");
const backupPath = resolve(here, "..", ".package.json.original");

// If a previous pack failed between prepack and postpack, the backup will
// still exist. Restore from it so we strip from the original each time.
if (existsSync(backupPath)) {
  copyFileSync(backupPath, pkgPath);
}

copyFileSync(pkgPath, backupPath);

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
delete pkg.devDependencies;
// Strip workspace-only scripts too. None of these run automatically for
// consumers of the published tarball, and the files they reference
// (./scripts/*.mjs, tsup, vitest, tsc) aren't shipped with the package.
pkg.scripts = { postinstall: "node ./scripts/postinstall.mjs" };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Write to stderr so we don't pollute `npm pack --json` output.
console.error("prepack: stripped devDependencies and scripts from packed package.json");
