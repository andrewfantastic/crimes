import { resolve } from "node:path";
import { scan } from "@crimes/core";
import { formatHumanReport, formatJsonReport } from "@crimes/reporter";
import type { Command } from "commander";

interface ScanCommandOptions {
  format: "human" | "json";
  all: boolean;
  noColor: boolean;
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan a repository for maintainability crimes.")
    .argument("[path]", "directory to scan (defaults to current directory)")
    .option("--format <format>", "output format: human | json", "human")
    .option("--all", "show every finding instead of just the top ones", false)
    .option("--no-color", "disable ANSI colour output")
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

      const report = await scan({ root });

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
