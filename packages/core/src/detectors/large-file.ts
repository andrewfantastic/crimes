import type { Detector } from "../detector.js";
import type { Finding, Severity } from "../finding.js";

export const largeFileDetector: Detector = {
  id: "large_file",
  name: "Large File",
  description: "Flags files that exceed a configurable line-count threshold.",

  run(ctx) {
    const threshold = ctx.config.thresholds.largeFileLines;
    const lines = ctx.parsed.lineCount;

    if (lines <= threshold) return [];

    const ratio = lines / threshold;
    const severity = pickSeverity(ratio);
    const confidence = Math.min(0.7 + (ratio - 1) * 0.15, 0.95);
    const fnCount = ctx.parsed.functions.length;

    const finding: Finding = {
      id: "", // filled in by scan.ts
      type: "large_file",
      charge: "God File",
      severity,
      confidence: round(confidence),
      file: ctx.file,
      lines: [1, lines],
      summary:
        `File is ${lines} lines (threshold ${threshold}). Modules this large hide local ` +
        `coupling: small edits can collide with code an agent never loaded into context.`,
      evidence: [
        `${lines} non-empty lines`,
        `${ratio.toFixed(1)}× the configured ${threshold}-line threshold`,
        `${fnCount} top-level function${fnCount === 1 ? "" : "s"} declared in this file`,
      ],
      scores: {
        severity: severityScore(severity),
        confidence: round(confidence),
        agent_risk: round(Math.min(0.45 + (ratio - 1) * 0.18, 0.9)),
      },
      suggested_actions: [
        {
          kind: "split_file",
          description:
            "Split along clear responsibility boundaries. Smaller modules give humans and agents " +
            "a smaller surface to reason about per edit.",
          risk: "medium",
        },
      ],
    };

    return [finding];
  },
};

function pickSeverity(ratio: number): Severity {
  if (ratio >= 2) return "high";
  return "medium";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.85 : s === "medium" ? 0.6 : 0.35;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
