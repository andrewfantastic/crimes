import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  applySuppressionsToContext,
  context,
  countEntriesByDetector,
  countResurfacedByPinnedMinor,
  loadConfig,
  loadSuppressionsForRoot,
  readFeedback,
  resolveFeedbackPath,
} from "@crimes/core";
import {
  formatContextHumanReport,
  formatContextJsonReport,
} from "@crimes/reporter";
import type { Command } from "commander";
import {
  emitDetectorsDisabledBreadcrumb,
  emitFuturePinnedSuppressionsWarnings,
  emitResurfacedSuppressionsBreadcrumb,
  resolveNoColor,
} from "../breadcrumb.js";
import { fatalUserError, isUserSetupError } from "../runtime-errors.js";

declare const __CRIMES_VERSION__: string;

interface ContextCommandOptions {
  format: "human" | "json";
  noColor: boolean;
  root?: string;
  showSuppressed: boolean;
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
    .option(
      "--show-suppressed",
      "include findings filtered by .crimes/suppressions.json, annotated as suppressed",
      false,
    )
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
      let report;
      try {
        report = await context({
          ...(options.root !== undefined ? { root: options.root } : {}),
          file: absoluteFile,
        });
        // `context()` resolves the scan root itself (nearest enclosing
        // package.json by default); load suppressions from that same root
        // so the .crimes/suppressions.json lines up with the report.
        const resolvedRoot = report.repo.root;
        const config = loadConfig(resolvedRoot);
        const noColor = resolveNoColor(options);
        emitDetectorsDisabledBreadcrumb(config, { noColor });
        const suppressions = loadSuppressionsForRoot(resolvedRoot, config);
        emitFuturePinnedSuppressionsWarnings(
          suppressions.entries,
          __CRIMES_VERSION__,
          { noColor },
        );
        report = applySuppressionsToContext(report, suppressions.entries, {
          showSuppressed: options.showSuppressed,
          crimesVersion: __CRIMES_VERSION__,
        });
        emitResurfacedSuppressionsBreadcrumb(
          countResurfacedByPinnedMinor(report.findings),
          { noColor },
        );
      } catch (error) {
        if (isUserSetupError(error)) {
          fatalUserError(error);
          return;
        }
        throw error;
      }

      if (format === "json") {
        process.stdout.write(formatContextJsonReport(report) + "\n");
      } else {
        const effectiveNoColor = options.noColor || !process.stdout.isTTY;
        const feedbackEntries = effectiveNoColor
          ? []
          : (
              await readFeedback(resolveFeedbackPath(report.repo.root))
            ).entries;
        process.stdout.write(
          formatContextHumanReport(report, {
            noColor: effectiveNoColor,
            feedbackHints: {
              entriesByDetector: countEntriesByDetector(feedbackEntries),
            },
          }) + "\n",
        );
      }
    });
}
