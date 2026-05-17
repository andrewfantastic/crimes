import type {
  AuditConcern,
  AuditSuppressionEntry,
  AuditSuppressionsReport,
  Baseline,
  BaselineCheckReport,
  BaselineEntry,
  ContextReport,
  ContextRisk,
  DiffReport,
  ExplainReport,
  Finding,
  HighestSeverity,
  Hotspot,
  HotspotsReport,
  ScanReport,
  Severity,
  Verdict,
  VerdictReport,
} from "@crimes/core";
import { fingerprintFinding } from "@crimes/core";
import pc from "picocolors";

/**
 * Inline "Give feedback: ..." hint configuration. When set on
 * {@link HumanReportOptions} (or its `Context` / `Diff` / `Baseline`
 * equivalents), every rendered finding gets a one-line trailing hint
 * pointing at the `crimes feedback` command — or, for resurfaced
 * findings, the alternate "Previously marked fp" prompt.
 *
 * Suppression rules (matches the 0.6.0 stderr breadcrumb):
 *   • `noColor: true` on the report options suppresses hints entirely
 *     (so piped / `--no-color` invocations stay clean).
 *   • `disabled: true` here suppresses regardless of TTY.
 *   • `entriesByDetector[finding.type] >= capPerDetector` suppresses
 *     for that one detector — "once you've recorded 5 verdicts on
 *     `large_function`, you don't need the prompt anymore."
 *
 * JSON output never goes through this renderer, so the structured
 * contract is unaffected.
 */
export interface FeedbackHintOptions {
  /** Per-detector count of feedback entries from `.crimes/feedback.jsonl`. */
  entriesByDetector?: Record<string, number>;
  /** Force-disable hints (still respects noColor). */
  disabled?: boolean;
  /** Threshold above which to suppress the hint. Default 5. */
  capPerDetector?: number;
}

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
const DEFAULT_FEEDBACK_HINT_CAP = 5;

const RELATED_FILES_DISPLAY_CAP = 5;

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

function renderFinding(
  finding: Finding,
  n: number,
  colour: ColourFns,
  options: {
    alwaysShowRiskProfile?: boolean;
    feedbackHints?: FeedbackHintOptions;
    noColor?: boolean;
  } = {},
): string[] {
  const lineRange = finding.lines
    ? `:${finding.lines[0]}${finding.lines[1] !== finding.lines[0] ? `-${finding.lines[1]}` : ""}`
    : "";
  const location = `${finding.file}${lineRange}`;
  const symbol = finding.symbol ? ` (${finding.symbol})` : "";

  const out: string[] = [];
  out.push(`  ${colour.bold(`${n}.`)} ${colour.cyan(location)}${colour.dim(symbol)}`);
  out.push(`     ${colour.bold("Charge:")} ${finding.charge}`);
  const riskLine = renderRiskProfileLine(finding, colour, options);
  if (riskLine) out.push(riskLine);
  out.push(`     ${colour.bold("Summary:")} ${finding.summary}`);
  if (finding.evidence.length > 0) {
    out.push(`     ${colour.bold("Evidence:")}`);
    for (const ev of finding.evidence) {
      out.push(`       · ${colour.dim(ev)}`);
    }
  }
  if (finding.related_files && finding.related_files.length > 0) {
    const shown = finding.related_files.slice(0, RELATED_FILES_DISPLAY_CAP);
    const hidden = finding.related_files.length - shown.length;
    out.push(`     ${colour.bold("Also touches:")}`);
    for (const rel of shown) {
      out.push(`       · ${colour.cyan(rel)}`);
    }
    if (hidden > 0) {
      out.push(
        `       ${colour.dim(`… and ${hidden} more (see JSON output)`)}`,
      );
    }
  }
  if (finding.suppressed === true) {
    out.push(
      `     ${colour.dim("Suppressed:")} ${finding.suppression_reason ?? "(no reason)"}`,
    );
  }
  out.push(
    `     ${colour.dim(`id=${finding.id}  confidence=${finding.confidence.toFixed(2)}`)}`,
  );
  appendFeedbackHint(out, finding, colour, options);
  return out;
}

/**
 * Append the inline `Give feedback: ...` hint (or the resurfaced
 * variant) to a rendered finding's line buffer. Mutates `out`. Returns
 * silently when hints are disabled, when `noColor` is set, or when the
 * per-detector cap is met.
 */
function appendFeedbackHint(
  out: string[],
  finding: Finding,
  colour: ColourFns,
  options: { feedbackHints?: FeedbackHintOptions; noColor?: boolean },
): void {
  if (options.noColor) return;
  const hints = options.feedbackHints;
  if (!hints || hints.disabled) return;
  const cap = hints.capPerDetector ?? DEFAULT_FEEDBACK_HINT_CAP;
  const count = hints.entriesByDetector?.[finding.type] ?? 0;
  if (count >= cap) return;

  const fp = fingerprintFinding(finding);
  if (finding.previously_suppressed && finding.previous_suppression) {
    out.push(
      `     ${colour.dim(`⚠ Previously marked fp in ${finding.previous_suppression.pinned_version}. Re-confirm: crimes feedback ${fp} --verdict {tp|fp}`)}`,
    );
    out.push(
      `     ${colour.dim("↳ See `crimes feedback recheck` to walk all resurfaced findings.")}`,
    );
    return;
  }
  out.push(
    `     ${colour.dim(`Give feedback: crimes feedback ${fp} --verdict {tp|fp}`)}`,
  );
}

/**
 * One-line "Risk profile" block surfacing the per-finding scoring signals
 * the 0.6.0 release added. Shown only when at least one of churn,
 * test_gap, or blast_radius is greater than 0.5 — keeps the report tidy
 * on low-signal findings — or always when `--all` was passed.
 */
function renderRiskProfileLine(
  finding: Finding,
  colour: ColourFns,
  options: { alwaysShowRiskProfile?: boolean },
): string | undefined {
  const { churn, test_gap, blast_radius } = finding.scores;
  if (churn === undefined && test_gap === undefined && blast_radius === undefined) {
    return undefined;
  }
  const notable =
    (churn ?? 0) > 0.5 ||
    (test_gap ?? 0) > 0.5 ||
    (blast_radius ?? 0) > 0.5;
  if (!notable && !options.alwaysShowRiskProfile) return undefined;
  const parts = [
    `churn ${(churn ?? 0).toFixed(2)}`,
    `test gap ${(test_gap ?? 0).toFixed(2)}`,
    `blast radius ${(blast_radius ?? 0).toFixed(2)}`,
  ];
  return `     ${colour.bold("Risk profile:")} ${colour.dim(parts.join(" · "))}`;
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
  /** Inline feedback hints (0.7.0). Suppressed when `noColor` is true. */
  feedbackHints?: FeedbackHintOptions;
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

  // Agent guidance — the field agents read first. Comes before findings
  // so a human running the human report sees the actionable summary line
  // before the more verbose finding bodies.
  lines.push("");
  lines.push(colour.bold("Agent guidance"));
  if (report.agent_guidance.length === 0) {
    const reason =
      report.agent_guidance_reason ?? "no specific guidance for this file";
    lines.push(colour.dim(`  (${reason})`));
  } else {
    for (const g of report.agent_guidance) {
      lines.push(`  · ${g}`);
    }
  }

  // Related files — neighbourhood discovery. Cap at 5 in the human
  // report (same convention as Finding.related_files) and note overflow.
  lines.push("");
  lines.push(colour.bold("Related files"));
  if (report.related_files.length === 0) {
    const reason =
      report.related_files_reason ?? "no related files found by convention";
    lines.push(colour.dim(`  (${reason})`));
  } else {
    const RELATED_DISPLAY_CAP = 5;
    const shown = report.related_files.slice(0, RELATED_DISPLAY_CAP);
    const hidden = report.related_files.length - shown.length;
    for (const r of shown) {
      lines.push(
        `  · ${colour.cyan(r.file)}  ${colour.dim(`— ${r.reason}`)}`,
      );
    }
    if (hidden > 0) {
      lines.push(
        colour.dim(`  … and ${hidden} more (see JSON output)`),
      );
    }
  }

  // Likely tests
  lines.push("");
  lines.push(colour.bold("Likely tests"));
  if (report.likely_tests.length === 0) {
    const reason =
      report.likely_tests_reason ?? "no likely tests found by convention";
    lines.push(colour.dim(`  (${reason})`));
  } else {
    for (const t of report.likely_tests) {
      lines.push(`  · ${colour.cyan(t)}`);
    }
  }

  // Findings — last, more verbose. Agents acting on the JSON read this
  // section from the structured `findings` array; humans get the same
  // information rendered.
  lines.push("");
  if (report.findings.length === 0) {
    lines.push(colour.green("No findings on this file. Suspiciously clean."));
  } else {
    lines.push(colour.bold("Findings"));
    report.findings.forEach((finding, idx) => {
      // crimes context <file> is a deep-dive on a single file — always
      // surface the risk profile so the user sees every signal we have.
      lines.push(
        ...renderFinding(finding, idx + 1, colour, {
          alwaysShowRiskProfile: true,
          feedbackHints: options.feedbackHints,
          noColor: options.noColor === true,
        }),
      );
      lines.push("");
    });
    // Trim trailing blank from the last finding block.
    if (lines[lines.length - 1] === "") lines.pop();
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
  } else if (report.history_limited) {
    // Same warning line position as the not-a-git-repo notice — agents
    // and humans look here first when the ranking feels off.
    const reason =
      report.history_limited_reason ??
      "shallow clone — older commits are unavailable";
    lines.push(colour.yellow(`  (history limited: ${reason})`));
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

export interface BaselineHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
  /** Inline feedback hints (0.7.0). Suppressed when `noColor` is true. */
  feedbackHints?: FeedbackHintOptions;
}

export function formatBaselineSaveReport(
  baseline: Baseline,
  baselinePath: string,
  options: BaselineHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES BASELINE SAVED"));
  lines.push(colour.dim(`path: ${baselinePath}`));
  lines.push(colour.dim(`created_at: ${baseline.created_at}`));
  lines.push("");

  const { total, high, medium, low } = baseline.summary;
  lines.push(
    `Recorded ${colour.bold(String(total))} finding${
      total === 1 ? "" : "s"
    } as the new baseline.`,
  );
  lines.push(
    colour.dim(
      `  ${colour.red(`high ${high}`)}  ${colour.yellow(`medium ${medium}`)}  ${colour.dim(`low ${low}`)}`,
    ),
  );
  lines.push("");
  lines.push(
    colour.dim(
      "Commit `.crimes/baseline.json` so future `crimes baseline check` runs share the same starting line.",
    ),
  );

  return lines.join("\n");
}

export function formatBaselineCheckReport(
  report: BaselineCheckReport,
  options: BaselineHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES BASELINE CHECK"));
  lines.push(colour.dim(`baseline: ${report.baseline_path}`));
  lines.push(colour.dim(`fail-on: ${report.fail_on}`));
  lines.push("");

  const { summary } = report;
  const newCount = colour.red(`${summary.new}`);
  const fixedCount = colour.green(`${summary.fixed}`);
  const unchangedCount = colour.dim(`${summary.unchanged}`);

  lines.push(`New crimes: ${newCount}`);
  lines.push(
    colour.dim(
      `  ${colour.red(`high ${summary.new_by_severity.high}`)}  ${colour.yellow(
        `medium ${summary.new_by_severity.medium}`,
      )}  ${colour.dim(`low ${summary.new_by_severity.low}`)}`,
    ),
  );
  lines.push(`Fixed crimes: ${fixedCount}`);
  lines.push(`Unchanged crimes: ${unchangedCount}`);
  lines.push("");

  if (report.new_findings.length > 0) {
    lines.push(
      colour.bold(`New findings (${report.new_findings.length})`),
    );
    report.new_findings.forEach((finding, idx) => {
      // Baseline check has no --all knob; fall back to the default notable
      // gate (renderRiskProfileLine hides the line when all three signals
      // are ≤ 0.5).
      lines.push(
        ...renderFinding(finding, idx + 1, colour, {
          feedbackHints: options.feedbackHints,
          noColor: options.noColor === true,
        }),
      );
      lines.push("");
    });
    if (lines[lines.length - 1] === "") lines.pop();
    lines.push("");
  }

  if (report.fixed_findings.length > 0) {
    lines.push(
      colour.bold(`Fixed findings (${report.fixed_findings.length})`),
    );
    report.fixed_findings.forEach((entry, idx) => {
      lines.push(...renderBaselineEntry(entry, idx + 1, colour));
    });
    lines.push("");
  }

  if (report.failed) {
    lines.push(
      colour.red(
        colour.bold(
          `FAILED: ${report.new_findings.length} new finding${
            report.new_findings.length === 1 ? "" : "s"
          } at or above "${report.fail_on}" severity.`,
        ),
      ),
    );
  } else {
    lines.push(
      colour.green(
        colour.bold(
          `OK: no new findings at or above "${report.fail_on}" severity.`,
        ),
      ),
    );
  }

  return lines.join("\n");
}

function renderBaselineEntry(
  entry: BaselineEntry,
  n: number,
  colour: ColourFns,
): string[] {
  const symbol = entry.symbol ? ` (${entry.symbol})` : "";
  const out: string[] = [];
  out.push(
    `  ${colour.bold(`${n}.`)} ${colour.cyan(entry.file)}${colour.dim(symbol)}`,
  );
  out.push(
    `     ${colour.bold("Charge:")} ${entry.charge} (${entry.severity})`,
  );
  return out;
}

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

export interface ExplainHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
}

/**
 * Render a `crimes explain` report as a human-readable block. Always
 * includes the suggested `crimes ignore <fingerprint> --reason "…"`
 * command verbatim so an agent or human can copy it without re-deriving
 * the fingerprint.
 */
export function formatExplainReport(
  report: ExplainReport,
  options: ExplainHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const f = report.finding;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES EXPLAIN"));
  lines.push(`${colour.bold("charge:")}    ${f.charge}`);
  lines.push(`${colour.bold("type:")}      ${f.type}`);
  lines.push(
    `${colour.bold("severity:")}  ${severityCell(f.severity, colour)}` +
      `   ${colour.bold("confidence:")} ${f.confidence.toFixed(2)}`,
  );
  lines.push(`${colour.bold("file:")}      ${f.file}`);
  if (f.symbol) {
    lines.push(`${colour.bold("symbol:")}    ${f.symbol}`);
  }
  if (f.lines) {
    const span = f.lines[0] === f.lines[1] ? `${f.lines[0]}` : `${f.lines[0]}–${f.lines[1]}`;
    lines.push(`${colour.bold("lines:")}     ${span}`);
  }
  if (f.suppressed === true) {
    lines.push(
      `${colour.bold("suppressed:")} ${f.suppression_reason ?? "(no reason)"}`,
    );
  }

  lines.push("");
  lines.push(colour.bold("What this detector looks for"));
  lines.push(`  ${report.detector.description}`);
  lines.push("");
  lines.push(colour.bold("Why it matters"));
  lines.push(`  ${report.why_it_matters || "(no rationale text for this detector)"}`);

  if (f.evidence.length > 0) {
    lines.push("");
    lines.push(colour.bold("Evidence"));
    for (const ev of f.evidence) {
      lines.push(`  · ${colour.dim(ev)}`);
    }
  }

  const riskBlock = explainRiskProfileBlock(f, colour);
  if (riskBlock.length > 0) {
    lines.push("");
    lines.push(...riskBlock);
  }

  if (f.suggested_actions && f.suggested_actions.length > 0) {
    lines.push("");
    lines.push(colour.bold("Suggested actions"));
    for (const action of f.suggested_actions) {
      lines.push(`  · ${action.kind} (risk: ${action.risk})`);
      lines.push(`      ${action.description}`);
    }
  }

  if (f.related_files && f.related_files.length > 0) {
    lines.push("");
    lines.push(colour.bold("Related files"));
    for (const rel of f.related_files) {
      lines.push(`  · ${colour.cyan(rel)}`);
    }
  }

  lines.push("");
  lines.push(
    colour.bold("To suppress (only if the team has decided this is acceptable)"),
  );
  lines.push(`  ${report.suggested_suppression_command}`);

  return lines.join("\n");
}

/**
 * "Risk profile" section for `crimes explain`. Each per-finding score
 * is shown alongside its raw evidence (commit count, importer count,
 * test-coverage hint) so the user sees *why* the score is what it is.
 * Returns an empty list when no scoring signal is present.
 */
function explainRiskProfileBlock(
  finding: Finding,
  colour: ColourFns,
): string[] {
  const { churn, test_gap, blast_radius } = finding.scores;
  if (churn === undefined && test_gap === undefined && blast_radius === undefined) {
    return [];
  }
  const lines: string[] = [];
  lines.push(colour.bold("Risk profile"));
  lines.push(
    `  · churn:        ${(churn ?? 0).toFixed(2)} — ` +
      churnExplain(churn ?? 0),
  );
  lines.push(
    `  · test gap:     ${(test_gap ?? 0).toFixed(2)} — ` +
      testGapExplain(test_gap ?? 0),
  );
  lines.push(
    `  · blast radius: ${(blast_radius ?? 0).toFixed(2)} — ` +
      blastRadiusExplain(blast_radius ?? 0),
  );
  return lines;
}

function churnExplain(score: number): string {
  if (score === 0) return "no commits touched this file in the last 90 days";
  if (score >= 1) return "20+ commits in the last 90 days (cap reached)";
  return `~${Math.round(score * 20)} commits in the last 90 days`;
}

function testGapExplain(score: number): string {
  if (score === 0) return "a test file imports this module";
  if (score === 0.5) {
    return "a sibling or __tests__ test file exists but does not import this module";
  }
  if (score >= 1) return "no sibling or __tests__ test file detected";
  return "partial coverage signal";
}

function blastRadiusExplain(score: number): string {
  if (score === 0) return "no other files import this one";
  if (score >= 1) return "50+ transitive importers (cap reached)";
  return `~${Math.round(score * 50)} transitive importers`;
}

export interface AuditSuppressionsHumanReportOptions {
  /** Disable ANSI colour output. */
  noColor?: boolean;
}

/**
 * Render an `crimes audit-suppressions` report as a human-readable block.
 * Entries with concerns are listed first under a "Flagged" heading; clean
 * entries follow under "Active". Concerns are surfaced inline per row.
 */
export function formatAuditSuppressionsReport(
  report: AuditSuppressionsReport,
  options: AuditSuppressionsHumanReportOptions = {},
): string {
  const colour = options.noColor ? plainColour() : pc;
  const lines: string[] = [];

  lines.push(colour.bold("CRIMES AUDIT-SUPPRESSIONS"));
  lines.push(
    colour.dim(`file: ${report.suppressions_path}`),
  );

  if (!report.loaded) {
    lines.push("");
    lines.push(
      colour.green(
        "No suppressions file found. Nothing to audit — run `crimes ignore` to add one.",
      ),
    );
    return lines.join("\n");
  }

  if (report.total === 0) {
    lines.push("");
    lines.push(
      colour.green("Suppressions file is empty. Nothing to audit."),
    );
    return lines.join("\n");
  }

  lines.push(
    colour.dim(
      `${report.total} suppression${report.total === 1 ? "" : "s"}  ·  ` +
        `${report.flagged_count} flagged`,
    ),
  );

  const flagged = report.entries.filter((e) => e.concerns.length > 0);
  const clean = report.entries.filter((e) => e.concerns.length === 0);

  if (flagged.length > 0) {
    lines.push("");
    lines.push(colour.bold(`Flagged (${flagged.length})`));
    for (const entry of flagged) {
      pushAuditEntry(lines, entry, colour);
    }
  }

  if (clean.length > 0) {
    lines.push("");
    lines.push(colour.bold(`Active (${clean.length})`));
    for (const entry of clean) {
      pushAuditEntry(lines, entry, colour);
    }
  }

  return lines.join("\n");
}

function pushAuditEntry(
  lines: string[],
  entry: AuditSuppressionEntry,
  colour: ColourFns,
): void {
  const ageLabel = `${entry.age_days}d`;
  const head = `  · ${colour.cyan(entry.fingerprint)} ${colour.dim(`(${ageLabel})`)}`;
  lines.push(head);
  lines.push(`      reason: ${entry.reason}`);
  if (entry.created_by) {
    lines.push(`      added by: ${colour.dim(entry.created_by)}`);
  }
  if (entry.concerns.length > 0) {
    lines.push(
      `      ${colour.yellow("concerns:")} ${entry.concerns
        .map((c) => describeConcern(c))
        .join(", ")}`,
    );
  }
}

function describeConcern(c: AuditConcern): string {
  switch (c) {
    case "stale":
      return "older than 180 days";
    case "short_reason":
      return "reason shorter than 16 characters";
    case "vague_reason":
      return "reason looks like a deferral keyword";
  }
}

function severityCell(s: Severity, colour: ColourFns): string {
  switch (s) {
    case "high":
      return colour.red(colour.bold(s));
    case "medium":
      return colour.yellow(colour.bold(s));
    case "low":
      return colour.dim(colour.bold(s));
  }
}
