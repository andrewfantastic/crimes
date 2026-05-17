import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";

interface InitCommandOptions {
  force: boolean;
}

const CONFIG_FILENAME = "crimes.config.json";

/**
 * Sensible starter `crimes.config.json` — opinionated defaults with
 * inline JSONC comments that explain the new knobs. The trailing newline
 * keeps `git diff` and POSIX text tools happy.
 *
 * The `$schema` URL is reserved against the website's eventual hosting;
 * even if it 404s today, the comment block tells the user where they
 * would get IDE validation once it lands.
 */
const STARTER_CONFIG = `{
  "$schema": "https://crimes.sh/schema/0.1.0/config.json",

  "include": ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.generated.*",
    "**/.crimes/**"
  ],

  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,
    "todoDensityPerKLoc": 10
  },

  "detectors": {
    "enable": [],
    "disable": []
  },

  "ia": {
    "aliasGroups": []
  },

  "suppressions": {
    "path": ".crimes/suppressions.json"
  }
}
`;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description(
      "Write a starter crimes.config.json to the current directory.",
    )
    .option(
      "--force",
      "overwrite an existing crimes.config.json instead of failing",
      false,
    )
    .action((options: InitCommandOptions) => {
      const path = resolve(process.cwd(), CONFIG_FILENAME);

      if (existsSync(path) && !options.force) {
        process.stderr.write(
          `crimes: ${CONFIG_FILENAME} already exists. ` +
            `Pass --force to overwrite.\n`,
        );
        process.exit(2);
        return;
      }

      writeFileSync(path, STARTER_CONFIG, "utf8");

      const lineCount = STARTER_CONFIG.split("\n").length - 1;
      process.stdout.write(
        `Wrote ${CONFIG_FILENAME} (${lineCount} lines). ` +
          `Tweak include/exclude/thresholds and commit.\n`,
      );
    });
}

/**
 * Exposed for the init command's tests — keeps the file fixture in sync
 * with the writer.
 */
export const STARTER_CONFIG_TEXT = STARTER_CONFIG;
