import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import type { DetectorContext } from "../detector.js";
import { directDateDetector } from "./direct-date.js";

function makeCtx(uses: Array<{ kind: "now" | "new"; line: number }>): DetectorContext {
  return {
    file: "src/date.ts",
    absolutePath: "/tmp/date.ts",
    source: "",
    parsed: {
      lineCount: 50,
      functions: [],
      dateNowOrNewDateUses: uses,
    },
    config: DEFAULT_CONFIG,
  };
}

describe("directDateDetector", () => {
  it("returns nothing when there are no Date uses", async () => {
    const findings = await directDateDetector.run(makeCtx([]));
    expect(findings).toEqual([]);
  });

  it("reports the count and line range", async () => {
    const findings = await directDateDetector.run(
      makeCtx([
        { kind: "now", line: 3 },
        { kind: "new", line: 17 },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.lines).toEqual([3, 17]);
    expect(findings[0]!.summary).toMatch(/2 direct uses/);
  });

  it("escalates to medium at 5+ uses", async () => {
    const uses = Array.from({ length: 5 }, (_, i) => ({ kind: "now" as const, line: i + 1 }));
    const findings = await directDateDetector.run(makeCtx(uses));
    expect(findings[0]!.severity).toBe("medium");
  });
});
