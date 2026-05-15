// Minimal static-site build: copy `src/` to `dist/`.
// A real framework will replace this when we pick one (Astro or Next.js).
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const distDir = resolve(here, "../dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(srcDir, distDir, { recursive: true });

console.log(`Built website to ${distDir}`);
