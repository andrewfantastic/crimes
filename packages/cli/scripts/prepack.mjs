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
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log("prepack: stripped devDependencies from packed package.json");
