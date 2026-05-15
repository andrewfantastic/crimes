import type { Detector } from "../detector.js";
import type { Finding, Severity } from "../finding.js";

export const largeFunctionDetector: Detector = {
  id: "large_function",
  name: "Large Function",
  description: "Flags functions and methods whose body exceeds a configurable line threshold.",

  run(ctx) {
    const threshold = ctx.config.thresholds.largeFunctionLines;
    const findings: Finding[] = [];

    for (const fn of ctx.parsed.functions) {
      const length = fn.endLine - fn.startLine + 1;
      if (length <= threshold) continue;

      const ratio = length / threshold;
      const severity = pickSeverity(ratio);
      const confidence = Math.min(0.7 + (ratio - 1) * 0.15, 0.95);

      findings.push({
        id: "",
        type: "large_function",
        charge: "God Function",
        severity,
        confidence: round(confidence),
        file: ctx.file,
        symbol: fn.name ?? "<anonymous>",
        lines: [fn.startLine, fn.endLine],
        summary: `${fn.name ?? "<anonymous>"} is ${length} lines long (threshold ${threshold}).`,
        evidence: [
          `${length} lines from ${fn.startLine} to ${fn.endLine}`,
          `${ratio.toFixed(1)}× the configured threshold (${threshold})`,
          fn.kind === "method" ? `defined as a class method` : `defined as a ${fn.kind}`,
        ],
        scores: {
          severity: severityScore(severity),
          confidence: round(confidence),
          agent_risk: Math.min(0.5 + (ratio - 1) * 0.2, 0.95),
        },
        suggested_actions: [
          {
            kind: "extract_function",
            description:
              "Extract cohesive sections into named helpers so agents can reason about one responsibility at a time.",
            risk: "low",
          },
        ],
      });
    }

    return findings;
  },
};

function pickSeverity(ratio: number): Severity {
  if (ratio >= 3) return "high";
  if (ratio >= 1.75) return "medium";
  return "low";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.9 : s === "medium" ? 0.65 : 0.4;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
