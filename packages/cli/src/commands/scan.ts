import { resolve } from "node:path";
import {
  applyScanFailOn,
  NotAGitRepoError,
  scan,
  UnknownGitRefError,
} from "@crimes/core";
import type { FailOn } from "@crimes/core";
import {
  formatHumanReport,
  formatJsonReport,
  formatScanFailOnLine,
} from "@crimes/reporter";
import type { Command } from "commander";

interface ScanCommandOptions {
  format: "human" | "json";
  all: boolean;
  noColor: boolean;
  changed: boolean;
  base?: string;
  failOn?: string;
}

const VALID_FAIL_ON = new Set<FailOn>(["low", "medium", "high"]);

function isFailOn(value: string): value is FailOn {
  return VALID_FAIL_ON.has(value as FailOn);
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
    .option(
      "--fail-on <severity>",
      "with --changed, exit non-zero when a finding meets this severity: low | medium | high",
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

      if (options.failOn !== undefined && !options.changed) {
        process.stderr.write(
          `crimes: --fail-on only applies when --changed is set.\n`,
        );
        process.exit(2);
        return;
      }

      if (options.failOn !== undefined && !isFailOn(options.failOn)) {
        process.stderr.write(
          `crimes: unknown --fail-on "${options.failOn}". Expected "low", "medium", or "high".\n`,
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

      const failOn =
        options.failOn !== undefined && options.changed
          ? (options.failOn as FailOn)
          : undefined;
      const gatedReport =
        failOn !== undefined ? applyScanFailOn(report, failOn) : report;

      if (format === "json") {
        process.stdout.write(formatJsonReport(gatedReport) + "\n");
      } else {
        process.stdout.write(
          formatHumanReport(gatedReport, {
            showAll: options.all,
            noColor: options.noColor || !process.stdout.isTTY,
          }) + "\n",
        );
        if (failOn !== undefined) {
          process.stdout.write(
            formatScanFailOnLine(gatedReport, {
              noColor: options.noColor || !process.stdout.isTTY,
            }) + "\n",
          );
        }
      }

      // Default `crimes scan` keeps the always-exit-0 behaviour; the gate
      // only fires when the user opted in with --changed --fail-on.
      if (failOn !== undefined && gatedReport.failed === true) {
        process.exit(1);
      }
    });
}
