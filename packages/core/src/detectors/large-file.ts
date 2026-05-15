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
    const confidence = Math.min(0.6 + (ratio - 1) * 0.2, 0.95);

    const finding: Finding = {
      id: "", // filled in by scan.ts
      type: "large_file",
      charge: "God File",
      severity,
      confidence: round(confidence),
      file: ctx.file,
      lines: [1, lines],
      summary: `File is ${lines} lines long (threshold ${threshold}).`,
      evidence: [
        `${lines} non-empty lines`,
        `${ratio.toFixed(1)}× the configured threshold (${threshold})`,
      ],
      scores: {
        severity: severityScore(severity),
        confidence: round(confidence),
        agent_risk: Math.min(0.4 + (ratio - 1) * 0.15, 0.9),
      },
      suggested_actions: [
        {
          kind: "split_file",
          description:
            "Split the file along clear responsibility boundaries; large files hide local coupling from both humans and agents.",
          risk: "medium",
        },
      ],
    };

    return [finding];
  },
};

function pickSeverity(ratio: number): Severity {
  if (ratio >= 3) return "high";
  if (ratio >= 1.75) return "medium";
  return "low";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.85 : s === "medium" ? 0.6 : 0.35;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
