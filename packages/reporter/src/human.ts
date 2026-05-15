import type { Finding, ScanReport, Severity } from "@crimes/core";
import pc from "picocolors";

export interface HumanReportOptions {
  /** When true, every finding is shown. Otherwise the top N. */
  showAll?: boolean;
  /** Default cap on findings shown when `showAll` is false. */
  topN?: number;
  /** Disable ANSI colour output. */
  noColor?: boolean;
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
      lines.push(...renderFinding(finding, idx + 1, colour));
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

  return lines.join("\n");
}

function renderFinding(finding: Finding, n: number, colour: ColourFns): string[] {
  const lineRange = finding.lines
    ? `:${finding.lines[0]}${finding.lines[1] !== finding.lines[0] ? `-${finding.lines[1]}` : ""}`
    : "";
  const location = `${finding.file}${lineRange}`;
  const symbol = finding.symbol ? ` (${finding.symbol})` : "";

  const out: string[] = [];
  out.push(`  ${colour.bold(`${n}.`)} ${colour.cyan(location)}${colour.dim(symbol)}`);
  out.push(`     ${colour.bold("Charge:")} ${finding.charge}`);
  out.push(`     ${colour.bold("Summary:")} ${finding.summary}`);
  if (finding.evidence.length > 0) {
    out.push(`     ${colour.bold("Evidence:")}`);
    for (const ev of finding.evidence) {
      out.push(`       · ${colour.dim(ev)}`);
    }
  }
  out.push(
    `     ${colour.dim(`id=${finding.id}  confidence=${finding.confidence.toFixed(2)}`)}`,
  );
  return out;
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

function groupBySeverity(findings: Finding[]): Record<Severity, Finding[]> {
  const groups: Record<Severity, Finding[]> = { high: [], medium: [], low: [] };
  for (const f of findings) groups[f.severity].push(f);
  return groups;
}

type ColourFns = typeof pc;

function plainColour(): ColourFns {
  const passthrough = (s: string): string => s;
  return new Proxy({} as ColourFns, {
    get: () => passthrough,
  });
}
