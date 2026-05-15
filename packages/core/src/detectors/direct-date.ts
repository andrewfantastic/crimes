import type { DateUse } from "@crimes/language-js";
import type { Detector } from "../detector.js";
import type { Finding } from "../finding.js";

export const directDateDetector: Detector = {
  id: "direct_date",
  name: "Direct Date.now() / new Date()",
  description:
    "Flags direct uses of Date.now() and new Date() — these make code hard to test and fragile across timezones.",

  run(ctx) {
    const hits = ctx.parsed.dateNowOrNewDateUses;
    if (hits.length === 0) return [];

    const severity =
      hits.length >= 5 ? "medium" : hits.length >= 2 ? "low" : "low";
    const lineList = hits.map((h: DateUse) => h.line).slice(0, 10);

    const finding: Finding = {
      id: "",
      type: "direct_date",
      charge: "Temporal Recklessness",
      severity,
      confidence: 0.85,
      file: ctx.file,
      lines: [hits[0]!.line, hits[hits.length - 1]!.line],
      summary: `${hits.length} direct use${hits.length === 1 ? "" : "s"} of Date.now() or new Date().`,
      evidence: [
        ...hits.slice(0, 5).map(
          (h: DateUse) => `line ${h.line}: ${h.kind === "now" ? "Date.now()" : "new Date()"}`,
        ),
        hits.length > 5 ? `…and ${hits.length - 5} more` : "",
        `lines: ${lineList.join(", ")}`,
      ].filter(Boolean) as string[],
      scores: {
        severity: severity === "medium" ? 0.55 : 0.35,
        confidence: 0.85,
        agent_risk: 0.55,
      },
      suggested_actions: [
        {
          kind: "inject_clock",
          description:
            "Inject a clock/now() function so domain code is deterministic in tests and free of hidden temporal coupling.",
          risk: "low",
        },
      ],
    };

    return [finding];
  },
};
