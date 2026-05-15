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

  it("flags files over the threshold", async () => {
    const findings = await largeFileDetector.run(makeCtx(1200));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("large_file");
    expect(findings[0]!.charge).toBe("God File");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.evidence.length).toBeGreaterThan(0);
  });

  it("escalates severity with file size", async () => {
    const justOver = await largeFileDetector.run(makeCtx(400));
    const huge = await largeFileDetector.run(makeCtx(2000));
    expect(justOver[0]!.severity).toBe("low");
    expect(huge[0]!.severity).toBe("high");
  });
});
