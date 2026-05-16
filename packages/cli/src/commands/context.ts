import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { context } from "@crimes/core";
import {
  formatContextHumanReport,
  formatContextJsonReport,
} from "@crimes/reporter";
import type { Command } from "commander";

interface ContextCommandOptions {
  format: "human" | "json";
  noColor: boolean;
  root?: string;
}

export function registerContextCommand(program: Command): void {
  program
    .command("context")
    .description(
      "Inspect a single file: known crimes, likely tests, and agent-safe editing notes.",
    )
    .argument("<file>", "file to inspect (repo-relative or absolute)")
    .option(
      "--root <path>",
      "repo root used for discovery (defaults to current directory)",
    )
    .option("--format <format>", "output format: human | json", "human")
    .option("--no-color", "disable ANSI colour output")
    .action(async (file: string, options: ContextCommandOptions) => {
      const format = options.format;
      if (format !== "human" && format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }

      // Existence check uses the explicit root if set, otherwise cwd —
      // this is just so we fail fast on a typo'd path. The real scan-root
      // selection (nearest enclosing package.json) happens inside
      // `context()` so the JSON paths line up with that scan scope.
      const lookupRoot = resolve(options.root ?? process.cwd());
      const absoluteFile = isAbsolute(file) ? file : resolve(lookupRoot, file);

      if (!existsSync(absoluteFile)) {
        process.stderr.write(`crimes: file not found: ${file}\n`);
        process.exit(2);
        return;
      }

      // Forward `--root` only when the user explicitly set it. Passing
      // `undefined` lets core's auto package-root detection win — that's
      // what makes `crimes context examples/pkg/src/foo.ts` from a
      // monorepo root produce the same findings as running it from
      // inside `examples/pkg`.
      const report = await context({
        ...(options.root !== undefined ? { root: options.root } : {}),
        file: absoluteFile,
      });

      if (format === "json") {
        process.stdout.write(formatContextJsonReport(report) + "\n");
      } else {
        process.stdout.write(
          formatContextHumanReport(report, {
            noColor: options.noColor || !process.stdout.isTTY,
          }) + "\n",
        );
      }
    });
}
