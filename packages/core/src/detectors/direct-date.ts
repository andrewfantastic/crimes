import type { DateUse } from "@crimes/language-js";
import type { Detector } from "../detector.js";
import type { Finding, Severity } from "../finding.js";

export const directDateDetector: Detector = {
  id: "direct_date",
  name: "Direct Date.now() / new Date()",
  description:
    "Flags direct uses of Date.now() and new Date() — these make code hard to test and " +
    "introduce hidden timezone coupling.",

  run(ctx) {
    const hits = ctx.parsed.dateNowOrNewDateUses;
    if (hits.length === 0) return [];

    const severity = pickSeverity(hits.length);
    const lineList = hits.map((h: DateUse) => h.line).slice(0, 10);
    const nowCount = hits.filter((h) => h.kind === "now").length;
    const newCount = hits.length - nowCount;
    const breakdown =
      nowCount > 0 && newCount > 0
        ? `${nowCount}× Date.now(), ${newCount}× new Date()`
        : nowCount > 0
          ? `${nowCount}× Date.now()`
          : `${newCount}× new Date()`;

    const finding: Finding = {
      id: "",
      type: "direct_date",
      charge: "Temporal Recklessness",
      severity,
      confidence: 0.9,
      file: ctx.file,
      lines: [hits[0]!.line, hits[hits.length - 1]!.line],
      summary:
        `${hits.length} direct use${hits.length === 1 ? "" : "s"} of Date.now()/new Date(). ` +
        `Reading the system clock in domain code makes behaviour non-deterministic and couples ` +
        `tests to wall time.`,
      evidence: [
        breakdown,
        `lines: ${lineList.join(", ")}${hits.length > 10 ? `, …+${hits.length - 10} more` : ""}`,
        `each call observes wall time at runtime — tests cannot pin a fixed moment without monkey-patching`,
      ],
      scores: {
        severity: severityScoreFor(severity),
        confidence: 0.9,
        agent_risk: Math.min(0.45 + (hits.length - 1) * 0.07, 0.85),
      },
      suggested_actions: [
        {
          kind: "inject_clock",
          description:
            "Inject a clock/now() abstraction so domain code is deterministic in tests and " +
            "free of hidden temporal coupling.",
          risk: "low",
        },
      ],
    };

    return [finding];
  },
};

function pickSeverity(count: number): Severity {
  // A single use is noise. Two or more direct clock reads in one file is a
  // recurring pattern — the whole module is bound to wall time. Eight or more
  // is pervasive enough to call high.
  if (count >= 8) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function severityScoreFor(s: Severity): number {
  return s === "high" ? 0.8 : s === "medium" ? 0.6 : 0.35;
}
