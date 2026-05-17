import { resolve } from "node:path";
import {
  diff,
  InvalidDiffRangeError,
  NotAGitRepoError,
  parseDiffRange,
  UnknownGitRefError,
} from "@crimes/core";
import { formatDiffJsonReport, formatDiffReport } from "@crimes/reporter";
import type { Command } from "commander";
import { fatalUserError, isUserSetupError } from "../runtime-errors.js";

interface DiffCommandOptions {
  format: "human" | "json";
  noColor: boolean;
  root?: string;
}

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description(
      "Report new, fixed, and unchanged crimes between two Git refs.",
    )
    .argument(
      "<range>",
      "git range, e.g. main...HEAD or origin/main...HEAD (triple-dot)",
    )
    .option("--format <format>", "output format: human | json", "human")
    .option("--no-color", "disable ANSI colour output")
    .option(
      "--root <path>",
      "repository root to run the diff in (defaults to current directory)",
    )
    .action(async (range: string, options: DiffCommandOptions) => {
      const root = resolve(options.root ?? process.cwd());
      const format = options.format;

      if (format !== "human" && format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }

      let parsed: { base: string; head: string };
      try {
        parsed = parseDiffRange(range);
      } catch (error) {
        if (error instanceof InvalidDiffRangeError) {
          process.stderr.write(`crimes: ${error.message}\n`);
          process.exit(2);
          return;
        }
        throw error;
      }

      let report;
      try {
        report = await diff({
          root,
          base: parsed.base,
          head: parsed.head,
        });
      } catch (error) {
        if (
          error instanceof NotAGitRepoError ||
          error instanceof UnknownGitRefError
        ) {
          process.stderr.write(`crimes: ${error.message}\n`);
          process.exit(2);
          return;
        }
        if (isUserSetupError(error)) {
          fatalUserError(error);
          return;
        }
        throw error;
      }

      if (format === "json") {
        process.stdout.write(formatDiffJsonReport(report) + "\n");
        return;
      }

      process.stdout.write(
        formatDiffReport(report, {
          noColor: options.noColor || !process.stdout.isTTY,
        }) + "\n",
      );

      // Don't exit non-zero on new findings yet — `--fail-on new-high`
      // lands later in the 0.2.0 slice alongside baseline support.
    });
}
