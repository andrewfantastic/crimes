import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.CRIMES_DISABLE_POSTINSTALL === "1") {
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
let version = "";
try {
  const pkg = JSON.parse(readFileSync(resolve(here, "..", "package.json"), "utf8"));
  version = typeof pkg.version === "string" ? ` ${pkg.version}` : "";
} catch {
  // No-op: the message is still useful without a version.
}

// npm 7+ swallows postinstall stdout/stderr unless the user passes
// `--foreground-scripts` or sets `foreground-scripts=true` in `.npmrc`.
// Most users will never see this message, but those who do get the
// three commands they'd want next. The bare `crimes` invocation in the
// CLI itself is the reliable surface — see packages/cli/src/index.ts.
process.stdout.write(
  [
    `crimes${version} installed.`,
    "",
    "Pick one to get started:",
    "  crimes init --agents   config + Claude Code and Codex skills",
    "  crimes init            just the config",
    "  crimes --help          list all commands",
    "",
    "Docs: https://crimes.sh",
    "",
  ].join("\n"),
);
