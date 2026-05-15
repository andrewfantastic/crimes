import type { Detector } from "../detector.js";
import type { Finding, Severity } from "../finding.js";

const TODO_PATTERN = /\b(TODO|FIXME|XXX|HACK)\b/g;

export const todoDensityDetector: Detector = {
  id: "todo_density",
  name: "TODO/FIXME Density",
  description: "Flags files with a high concentration of TODO, FIXME, XXX, or HACK markers.",

  run(ctx) {
    const matches = [...ctx.source.matchAll(TODO_PATTERN)];
    if (matches.length === 0) return [];

    const lines = ctx.parsed.lineCount;
    const kloc = Math.max(lines / 1000, 0.001);
    const density = matches.length / kloc;
    const threshold = ctx.config.thresholds.todoDensityPerKLoc;

    // Floor: at least 3 markers OR density above the configured threshold before
    // we even surface this. A lone TODO is noise.
    if (matches.length < 3 && density < threshold) return [];

    const ratio = density / threshold;
    const severity = pickSeverity(matches.length, ratio);
    const breakdown = countByMarker(matches);

    const finding: Finding = {
      id: "",
      type: "todo_density",
      charge: "Unfinished Business",
      severity,
      confidence: 0.7,
      file: ctx.file,
      summary:
        matches.length === 1
          ? `1 TODO/FIXME marker in this file.`
          : `${matches.length} TODO/FIXME markers (${density.toFixed(1)} per 1k LOC). ` +
            `Each marker is intended behaviour the author flagged as not-final — too many in ` +
            `one file makes it hard for an agent to tell which logic is load-bearing.`,
      evidence: [
        Object.entries(breakdown)
          .map(([k, v]) => `${v}× ${k}`)
          .join(", "),
        `${density.toFixed(1)} markers per 1k LOC (threshold ${threshold})`,
      ],
      scores: {
        severity: severityScore(severity),
        confidence: 0.7,
        // TODO markers are a weak signal — they describe intent gaps, not behavioural bugs.
        // Keep agent_risk modest unless the density is extreme.
        agent_risk: Math.min(0.2 + Math.max(ratio - 1, 0) * 0.05, 0.55),
      },
      suggested_actions: [
        {
          kind: "triage_todos",
          description:
            "Convert each marker into a tracked issue or remove it. Lingering TODOs mislead " +
            "humans and agents about which behaviour is intentional.",
          risk: "low",
        },
      ],
    };

    return [finding];
  },
};

function countByMarker(matches: RegExpMatchArray[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of matches) {
    const key = m[0] ?? "TODO";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function pickSeverity(count: number, ratio: number): Severity {
  // TODO density is informational, not catastrophic. Only flag HIGH when the
  // file is genuinely overrun (many markers AND extreme density). Otherwise
  // medium for clearly elevated, and low for everything else that fires.
  if (count >= 20 && ratio >= 10) return "high";
  if (count >= 8 || ratio >= 10) return "medium";
  return "low";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.6 : s === "medium" ? 0.4 : 0.2;
}
