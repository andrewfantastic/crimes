import type { Finding, ScanReport, Severity } from "@crimes/core";
import type { ColourFns, FeedbackHintOptions } from "./shared.js";
import { pc, plainColour, renderFinding } from "./shared.js";

export interface HumanReportOptions {
  /** When true, every finding is shown. Otherwise the top N. */
  showAll?: boolean;
  /** Default cap on findings shown when `showAll` is false. */
  topN?: number;
  /** Disable ANSI colour output. */
  noColor?: boolean;
  /** Inline feedback hints (0.7.0). Suppressed when `noColor` is true. */
  feedbackHints?: FeedbackHintOptions;
}

const DEFAULT_TOP_N = 10;

export function formatHumanReport(
  report: ScanReport,
  options: HumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const topN = options.topN ?? DEFAULT_TOP_N;
  const showAll = options.showAll ?? false;

  const lines: string[] = [];
  lines.push(colour.bold("CRIME SCENE REPORT"));
  lines.push(colour.dim(`repo: ${report.repo.name}  ·  ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`));
  lines.push("");

  if (report.findings.length === 0) {
    lines.push(colour.green("No crimes detected. Suspiciously clean."));
    return lines.join("\n");
  }

  const shown = showAll ? report.findings : report.findings.slice(0, topN);
  const grouped = groupBySeverity(shown);

  for (const sev of ["high", "medium", "low"] as const) {
    const group = grouped[sev];
    if (group.length === 0) continue;
    lines.push(severityHeading(sev, group.length, colour));
    group.forEach((finding, idx) => {
      lines.push(
        ...renderFinding(finding, idx + 1, colour, {
          alwaysShowRiskProfile: showAll,
          feedbackHints: options.feedbackHints,
          noColor: options.noColor === true,
        }),
      );
      lines.push("");
    });
  }

  if (!showAll && report.findings.length > shown.length) {
    const hidden = report.findings.length - shown.length;
    lines.push(
      colour.dim(
        `Showing top ${shown.length} of ${report.findings.length}. Run with --all to see ${hidden} more.`,
      ),
    );
  }

  lines.push("");
  lines.push(
    summaryLine(report, colour),
  );

  if (report.suppressed_count && report.suppressed_count > 0) {
    lines.push(
      colour.dim(
        `${report.suppressed_count} finding${
          report.suppressed_count === 1 ? "" : "s"
        } suppressed; run with --show-suppressed to see.`,
      ),
    );
  }

  return lines.join("\n");
}

function severityHeading(
  sev: Severity,
  count: number,
  colour: ColourFns,
): string {
  const label = `${sev.toUpperCase()} severity (${count})`;
  switch (sev) {
    case "high":
      return colour.red(colour.bold(label));
    case "medium":
      return colour.yellow(colour.bold(label));
    case "low":
      return colour.dim(colour.bold(label));
  }
}

function summaryLine(report: ScanReport, colour: ColourFns): string {
  const { high, medium, low, total } = report.summary;
  return colour.dim(
    `Total ${total}  ·  ${colour.red(`high ${high}`)}  ${colour.yellow(`medium ${medium}`)}  ${colour.dim(`low ${low}`)}`,
  );
}

export interface ScanFailOnLineOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
}

/**
 * Render the trailing OK / FAILED gate line that `crimes scan --changed
 * --fail-on <severity>` prints after the standard human report.
 *
 * Requires `report.fail_on` to be set — i.e. the report was produced via
 * {@link applyScanFailOn} from `@crimes/core`. The line is intentionally
 * short and self-contained so it reads cleanly inside CI logs.
 */
export function formatScanFailOnLine(
  report: ScanReport,
  options: ScanFailOnLineOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const failOn = report.fail_on ?? "medium";
  if (report.failed) {
    return colour.red(
      colour.bold(
        `FAILED: at least one finding at or above "${failOn}" severity in the changed set.`,
      ),
    );
  }
  return colour.green(
    colour.bold(
      `OK: no findings at or above "${failOn}" severity in the changed set.`,
    ),
  );
}

function groupBySeverity(findings: Finding[]): Record<Severity, Finding[]> {
  const groups: Record<Severity, Finding[]> = { high: [], medium: [], low: [] };
  for (const f of findings) groups[f.severity].push(f);
  return groups;
}
