import { resolve } from "node:path";
import { NotAGitRepoError, scan, UnknownGitRefError } from "@crimes/core";
import { formatHumanReport, formatJsonReport } from "@crimes/reporter";
import type { Command } from "commander";

interface ScanCommandOptions {
  format: "human" | "json";
  all: boolean;
  noColor: boolean;
  changed: boolean;
  base?: string;
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan a repository for maintainability crimes.")
    .argument("[path]", "directory to scan (defaults to current directory)")
    .option("--format <format>", "output format: human | json", "human")
    .option("--all", "show every finding instead of just the top ones", false)
    .option("--no-color", "disable ANSI colour output")
    .option(
      "--changed",
      "only scan files changed in the working tree (and vs --base when set)",
      false,
    )
    .option(
      "--base <ref>",
      "Git ref to compare against when --changed is set, e.g. main or origin/main",
    )
    .action(async (path: string | undefined, options: ScanCommandOptions) => {
      const root = resolve(path ?? process.cwd());
      const format = options.format;

      if (format !== "human" && format !== "json") {
        process.stderr.write(
          `crimes: unknown --format "${String(format)}". Expected "human" or "json".\n`,
        );
        process.exit(2);
        return;
      }

      if (options.base && !options.changed) {
        process.stderr.write(
          `crimes: --base only applies when --changed is set.\n`,
        );
        process.exit(2);
        return;
      }

      let report;
      try {
        report = await scan({
          root,
          changed: options.changed,
          base: options.base,
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
        throw error;
      }

      if (format === "json") {
        process.stdout.write(formatJsonReport(report) + "\n");
      } else {
        process.stdout.write(
          formatHumanReport(report, {
            showAll: options.all,
            noColor: options.noColor || !process.stdout.isTTY,
          }) + "\n",
        );
      }

      // Don't exit non-zero on findings yet — that's a Milestone 4 (CI gate) concern.
    });
}
