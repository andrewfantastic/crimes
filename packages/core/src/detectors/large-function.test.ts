import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import type { DetectorContext } from "../detector.js";
import { largeFunctionDetector } from "./large-function.js";

function makeCtx(functions: Array<{ name?: string; start: number; end: number }>): DetectorContext {
  return {
    file: "src/billing.ts",
    absolutePath: "/tmp/billing.ts",
    source: "",
    parsed: {
      lineCount: 1000,
      functions: functions.map((f) => ({
        name: f.name,
        kind: "function" as const,
        startLine: f.start,
        endLine: f.end,
      })),
      dateNowOrNewDateUses: [],
    },
    config: DEFAULT_CONFIG,
  };
}

describe("largeFunctionDetector", () => {
  it("ignores short functions", async () => {
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "small", start: 1, end: 20 }]),
    );
    expect(findings).toEqual([]);
  });

  it("flags long functions and reports the symbol", async () => {
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "generateInvoice", start: 10, end: 250 }]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.symbol).toBe("generateInvoice");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.lines).toEqual([10, 250]);
  });

  it("names anonymous functions", async () => {
    const findings = await largeFunctionDetector.run(
      makeCtx([{ start: 1, end: 200 }]),
    );
    expect(findings[0]!.symbol).toBe("<anonymous>");
  });
});
