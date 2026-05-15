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

  it("flags a barely-over-threshold function as medium", async () => {
    // 70-line function vs default 60-line threshold → ratio 1.17 → medium.
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "borderline", start: 1, end: 70 }]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
    expect(findings[0]!.symbol).toBe("borderline");
  });

  it("flags a flagrant function as high", async () => {
    // 250-line function → ratio 4.17 → high.
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "generateInvoice", start: 10, end: 259 }]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.symbol).toBe("generateInvoice");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.lines).toEqual([10, 259]);
  });

  it("escalates to high at >=2x threshold", async () => {
    // 120 lines is exactly 2x default 60-line threshold.
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "twoX", start: 1, end: 120 }]),
    );
    expect(findings[0]!.severity).toBe("high");
  });

  it("names anonymous functions", async () => {
    const findings = await largeFunctionDetector.run(
      makeCtx([{ start: 1, end: 200 }]),
    );
    expect(findings[0]!.symbol).toBe("<anonymous>");
  });

  it("summary mentions why the size matters", async () => {
    const findings = await largeFunctionDetector.run(
      makeCtx([{ name: "f", start: 1, end: 200 }]),
    );
    expect(findings[0]!.summary).toMatch(/responsibilities|agent|edit/i);
  });
});
