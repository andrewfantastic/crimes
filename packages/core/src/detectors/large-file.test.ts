import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import type { DetectorContext } from "../detector.js";
import { largeFileDetector } from "./large-file.js";

function makeCtx(lineCount: number): DetectorContext {
  return {
    file: "src/big.ts",
    absolutePath: "/tmp/big.ts",
    source: "",
    parsed: {
      lineCount,
      functions: [],
      dateNowOrNewDateUses: [],
    },
    config: DEFAULT_CONFIG,
  };
}

describe("largeFileDetector", () => {
  it("returns nothing for small files", async () => {
    const findings = await largeFileDetector.run(makeCtx(100));
    expect(findings).toEqual([]);
  });

  it("flags very large files as high", async () => {
    // 1200 lines vs 300-line default → ratio 4 → high.
    const findings = await largeFileDetector.run(makeCtx(1200));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("large_file");
    expect(findings[0]!.charge).toBe("God File");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.evidence.length).toBeGreaterThan(0);
  });

  it("flags barely-over-threshold files as medium, not low", async () => {
    // 400 lines vs 300-line default → ratio 1.33 → medium.
    const findings = await largeFileDetector.run(makeCtx(400));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium");
  });

  it("escalates to high at >=2x threshold", async () => {
    // 2000 lines → ratio 6.67 → high.
    const huge = await largeFileDetector.run(makeCtx(2000));
    expect(huge[0]!.severity).toBe("high");
  });

  it("summary explains why large files are risky", async () => {
    const findings = await largeFileDetector.run(makeCtx(800));
    expect(findings[0]!.summary).toMatch(/coupling|context|edit/i);
  });
});
