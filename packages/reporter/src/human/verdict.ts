import type { Verdict, VerdictReport } from "@crimes/core";
import type { ColourFns } from "./shared.js";
import { pc, plainColour } from "./shared.js";

export interface VerdictHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
}

export function formatVerdictReport(
  report: VerdictReport,
  options: VerdictHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES VERDICT"));
  lines.push(`base: ${colour.cyan(report.base)}`);
  lines.push(`head: ${colour.cyan(report.head)}`);
  lines.push("");

  lines.push(`Verdict: ${verdictLabel(report.verdict, colour)}`);
  lines.push(`New: ${colour.red(`${report.summary.new}`)}`);
  lines.push(`Fixed: ${colour.green(`${report.summary.fixed}`)}`);

  if (report.reasons.length > 0) {
    lines.push(`Reason: ${report.reasons.join("; ")}`);
  }

  if (report.recommended_actions.length > 0) {
    lines.push(
      `Recommended next action: ${report.recommended_actions.join(" ")}`,
    );
  }

  return lines.join("\n");
}

function verdictLabel(v: Verdict, colour: ColourFns): string {
  const upper = v.toUpperCase();
  switch (v) {
    case "worse":
      return colour.red(colour.bold(upper));
    case "cleaner":
      return colour.green(colour.bold(upper));
    case "unchanged":
      return colour.dim(colour.bold(upper));
    case "mixed":
      return colour.yellow(colour.bold(upper));
  }
}
