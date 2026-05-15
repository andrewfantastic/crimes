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

    if (matches.length < 3 && density < threshold) return [];

    const ratio = density / threshold;
    const severity = pickSeverity(matches.length, ratio);
    const breakdown = countByMarker(matches);

    const finding: Finding = {
      id: "",
      type: "todo_density",
      charge: "Unfinished Business",
      severity,
      confidence: 0.95,
      file: ctx.file,
      summary:
        matches.length === 1
          ? `1 TODO/FIXME marker in this file.`
          : `${matches.length} TODO/FIXME markers (${density.toFixed(1)} per 1k LOC).`,
      evidence: [
        ...Object.entries(breakdown).map(([k, v]) => `${v}× ${k}`),
        `${density.toFixed(1)} markers per 1k LOC (threshold ${threshold})`,
      ],
      scores: {
        severity: severityScore(severity),
        confidence: 0.95,
        agent_risk: Math.min(0.3 + ratio * 0.2, 0.8),
      },
      suggested_actions: [
        {
          kind: "triage_todos",
          description:
            "Convert each TODO into a tracked issue or remove it; lingering markers mislead agents about intended behaviour.",
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
  if (count >= 10 || ratio >= 3) return "high";
  if (count >= 5 || ratio >= 1.5) return "medium";
  return "low";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.7 : s === "medium" ? 0.5 : 0.3;
}
