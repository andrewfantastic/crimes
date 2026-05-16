import type {
  ContextReport,
  ContextRisk,
  DiffReport,
  Finding,
  HighestSeverity,
  Hotspot,
  HotspotsReport,
  ScanReport,
  Severity,
} from "@crimes/core";
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

export interface ContextHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
}

export function formatContextHumanReport(
  report: ContextReport,
  options: ContextHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES CONTEXT"));
  lines.push(colour.dim(`file: ${report.file}`));
  lines.push(`risk: ${riskLabel(report.risk, colour)}  ${riskCounts(report.risk, colour)}`);
  lines.push("");

  // Findings
  if (report.findings.length === 0) {
    lines.push(colour.green("No findings on this file. Suspiciously clean."));
  } else {
    lines.push(colour.bold("Findings"));
    report.findings.forEach((finding, idx) => {
      lines.push(...renderFinding(finding, idx + 1, colour));
      lines.push("");
    });
    // Trim trailing blank from the last finding block.
    if (lines[lines.length - 1] === "") lines.pop();
  }

  // Agent guidance
  lines.push("");
  lines.push(colour.bold("Agent guidance"));
  if (report.agent_guidance.length === 0) {
    lines.push(colour.dim("  (no specific guidance for this file)"));
  } else {
    for (const g of report.agent_guidance) {
      lines.push(`  · ${g}`);
    }
  }

  // Likely tests
  lines.push("");
  lines.push(colour.bold("Likely tests"));
  if (report.likely_tests.length === 0) {
    lines.push(colour.dim("  (no likely tests found by convention)"));
  } else {
    for (const t of report.likely_tests) {
      lines.push(`  · ${colour.cyan(t)}`);
    }
  }

  return lines.join("\n");
}

function riskLabel(risk: ContextRisk, colour: ColourFns): string {
  const upper = risk.level.toUpperCase();
  switch (risk.level) {
    case "high":
      return colour.red(colour.bold(upper));
    case "medium":
      return colour.yellow(colour.bold(upper));
    case "low":
      return colour.dim(colour.bold(upper));
    case "none":
      return colour.green(colour.bold(upper));
  }
}

function riskCounts(risk: ContextRisk, colour: ColourFns): string {
  if (risk.total === 0) return colour.dim("(0 findings)");
  return colour.dim(
    `(${risk.total} finding${risk.total === 1 ? "" : "s"}: ` +
      `${risk.high} high, ${risk.medium} medium, ${risk.low} low)`,
  );
}

export interface HotspotsHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
  /** When true, every hotspot is shown. Otherwise the top N. */
  showAll?: boolean;
  /** Default cap on hotspots shown when `showAll` is false. */
  topN?: number;
}

const DEFAULT_HOTSPOTS_TOP_N = 20;

export function formatHotspotsReport(
  report: HotspotsReport,
  options: HotspotsHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const topN = options.topN ?? DEFAULT_HOTSPOTS_TOP_N;
  const showAll = options.showAll ?? false;

  const lines: string[] = [];
  lines.push(colour.bold("CRIMES HOTSPOTS"));
  lines.push(
    colour.dim(
      `repo: ${report.repo.name}  ·  since ${report.since}  ·  ${
        report.hotspots.length
      } file${report.hotspots.length === 1 ? "" : "s"}`,
    ),
  );

  if (!report.git_available) {
    lines.push(
      colour.yellow(
        "  (not a git repo — ranking by findings only; no churn signal)",
      ),
    );
  }

  lines.push("");

  if (report.hotspots.length === 0) {
    lines.push(
      colour.green(
        "No hotspots found. Either the repo is calm or the window is too narrow.",
      ),
    );
    return lines.join("\n");
  }

  const shown = showAll ? report.hotspots : report.hotspots.slice(0, topN);
  for (const [idx, h] of shown.entries()) {
    lines.push(...renderHotspot(h, idx + 1, colour));
    lines.push("");
  }

  if (!showAll && report.hotspots.length > shown.length) {
    const hidden = report.hotspots.length - shown.length;
    lines.push(
      colour.dim(
        `Showing top ${shown.length} of ${report.hotspots.length}. Run with --all to see ${hidden} more.`,
      ),
    );
  }

  return lines.join("\n");
}

function renderHotspot(
  h: Hotspot,
  n: number,
  colour: ColourFns,
): string[] {
  const out: string[] = [];
  out.push(
    `  ${colour.bold(`${n}.`)} ${colour.cyan(h.file)}  ${riskBadge(h.risk, colour)}`,
  );
  const churnLine = h.latest_change
    ? `${h.change_count} change${h.change_count === 1 ? "" : "s"} · latest ${h.latest_change.slice(0, 10)}`
    : `${h.change_count} change${h.change_count === 1 ? "" : "s"}`;
  out.push(`     ${colour.dim(churnLine)}`);
  out.push(
    `     ${colour.dim(
      `${h.finding_count} finding${h.finding_count === 1 ? "" : "s"} · highest ${severityLabel(h.highest_severity, colour)}`,
    )}`,
  );
  return out;
}

function riskBadge(risk: number, colour: ColourFns): string {
  const pct = (risk * 100).toFixed(0).padStart(2, " ");
  const label = `risk ${risk.toFixed(2)} (${pct}%)`;
  if (risk >= 0.7) return colour.red(colour.bold(label));
  if (risk >= 0.4) return colour.yellow(colour.bold(label));
  return colour.dim(label);
}

function severityLabel(sev: HighestSeverity, colour: ColourFns): string {
  switch (sev) {
    case "high":
      return colour.red(sev);
    case "medium":
      return colour.yellow(sev);
    case "low":
      return colour.dim(sev);
    case "none":
      return colour.green(sev);
  }
}

export interface DiffHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
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
