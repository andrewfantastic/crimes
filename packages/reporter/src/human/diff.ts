import type { DiffReport } from "@crimes/core";
import type { FeedbackHintOptions } from "./shared.js";
import { pc, plainColour } from "./shared.js";

export interface DiffHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
  /** Inline feedback hints (0.7.0). Suppressed when `noColor` is true. */
  feedbackHints?: FeedbackHintOptions;
}

export function formatDiffReport(
  report: DiffReport,
  options: DiffHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES DIFF"));
  lines.push(`base: ${colour.cyan(report.base)}`);
  lines.push(`head: ${colour.cyan(report.head)}`);
  lines.push("");

  const newCount = colour.red(`${report.summary.new}`);
  const fixedCount = colour.green(`${report.summary.fixed}`);
  const unchangedCount = colour.dim(`${report.summary.unchanged}`);

  lines.push(`New crimes: ${newCount}`);
  lines.push(`Fixed crimes: ${fixedCount}`);
  lines.push(`Unchanged crimes: ${unchangedCount}`);

  return lines.join("\n");
}
