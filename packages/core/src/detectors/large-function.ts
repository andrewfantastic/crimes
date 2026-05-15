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
      const confidence = Math.min(0.8 + (ratio - 1) * 0.1, 0.95);
      const symbol = fn.name ?? "<anonymous>";

      findings.push({
        id: "",
        type: "large_function",
        charge: "God Function",
        severity,
        confidence: round(confidence),
        file: ctx.file,
        symbol,
        lines: [fn.startLine, fn.endLine],
        summary:
          `${symbol} spans ${length} lines — past the ${threshold}-line threshold for a single ` +
          `function. Bodies this size usually mix unrelated responsibilities, and an agent ` +
          `editing one section often misses interactions in another.`,
        evidence: [
          `lines ${fn.startLine}–${fn.endLine} (${length} lines)`,
          `${ratio.toFixed(1)}× the configured ${threshold}-line threshold`,
          fn.kind === "method"
            ? `class method — invariants are likely shared with sibling methods`
            : `${fn.kind.replace("_", " ")} declaration`,
        ],
        scores: {
          severity: severityScore(severity),
          confidence: round(confidence),
          agent_risk: Math.min(0.55 + (ratio - 1) * 0.2, 0.95),
        },
        suggested_actions: [
          {
            kind: "extract_function",
            description:
              "Extract cohesive sections into named helpers so each responsibility can be read, " +
              "tested, and edited in isolation.",
            risk: "low",
          },
        ],
      });
    }

    return findings;
  },
};

function pickSeverity(ratio: number): Severity {
  // The threshold itself draws the line. Anything past it is at least medium —
  // the function has already opted into "too big" territory. Flagrant cases
  // (≥2× threshold) escalate to high.
  if (ratio >= 2) return "high";
  return "medium";
}

function severityScore(s: Severity): number {
  return s === "high" ? 0.9 : s === "medium" ? 0.7 : 0.45;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
