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

      const root = resolve(options.root ?? process.cwd());
      const absoluteFile = isAbsolute(file) ? file : resolve(root, file);

      if (!existsSync(absoluteFile)) {
        process.stderr.write(`crimes: file not found: ${file}\n`);
        process.exit(2);
        return;
      }

      const report = await context({ root, file: absoluteFile });

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
