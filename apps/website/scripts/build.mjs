// Orchestrate the website build:
//   1. Sync `<repo>/docs/**/*.md` into `src/content/docs/` for Starlight.
//   2. Run `astro build` to produce the `/docs/` tree under `dist/docs/`.
//   3. Copy the static landing page (`landing/*`) into `dist/`.
//
// The landing page is kept verbatim — Astro doesn't render it — so the
// `crimes.sh/` surface is unaffected by the `0.6.0` docs site rollout.
import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const distDir = resolve(websiteDir, "dist");
const landingDir = resolve(websiteDir, "landing");

function run(cmd, args, opts = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: websiteDir,
      stdio: "inherit",
      ...opts,
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

await rm(distDir, { recursive: true, force: true });

// Step 1: sync markdown into the Starlight collection.
await run(process.execPath, [resolve(here, "sync-docs.mjs")]);

// Step 2: astro build. `outDir: ./dist` is configured in
// astro.config.mjs and `base: /docs` routes everything under `/docs/`,
// so Astro writes its tree directly into `dist/docs/...`.
const astroBin = resolve(websiteDir, "node_modules", ".bin", "astro");
if (!(await exists(astroBin))) {
  throw new Error(
    `astro CLI not found at ${astroBin}. Run \`pnpm install\` from the repo root.`,
  );
}
await run(astroBin, ["build"]);

// Step 3: copy the static landing page on top of dist. The Astro tree
// lives under `dist/docs/...`; landing files (index.html, styles.css,
// favicon.svg, llms.txt, robots.txt, sitemap.xml, og-image.svg) land
// at `dist/...`. No overlap by design.
await mkdir(distDir, { recursive: true });
await cp(landingDir, distDir, { recursive: true });

console.log(`Built website to ${distDir}`);
