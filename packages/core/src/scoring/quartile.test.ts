import { describe, expect, it } from "vitest";
import { quartileScores } from "./quartile.js";

describe("quartileScores", () => {
  it("returns 0 for the lowest, 1 for the highest, 0.5/0.75 for middle quartiles on a wide distribution", () => {
    const raw = [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1];
    const out = quartileScores(raw);
    // 30% at 0 → midpoint percentile 0.15 → quartile 0.0
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0);
    // 30% at 0.5 → midpoint percentile (0.3 + 0.6)/2 = 0.45 → quartile 0.5
    expect(out[3]).toBe(0.5);
    expect(out[5]).toBe(0.5);
    // 40% at 1 → midpoint percentile (0.6 + 1.0)/2 = 0.8 → quartile 1.0
    expect(out[6]).toBe(1);
    expect(out[9]).toBe(1);
  });

  it("assigns identical scores to all tied entries (rank-average tiebreak)", () => {
    const raw = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const out = quartileScores(raw);
    // Every entry tied → midpoint 0.5 → quartile 0.5 (NOT 1.0).
    expect(new Set(out).size).toBe(1);
    expect(out[0]).toBe(0.5);
  });

  it("falls back to raw values when input length is less than 4", () => {
    expect(quartileScores([1, 0.5, 0])).toEqual([1, 0.5, 0]);
    expect(quartileScores([1])).toEqual([1]);
    expect(quartileScores([])).toEqual([]);
  });

  it("snaps each distinct value into its calibrated quartile bucket", () => {
    // 4 distinct ascending values → percentiles 0.125, 0.375, 0.625, 0.875
    // → quartiles 0.0, 0.25, 0.75, 1.0 per the threshold table in quartile.ts.
    expect(quartileScores([0, 0.3, 0.7, 1])).toEqual([0, 0.25, 0.75, 1]);
  });

  it("preserves input order in the output array", () => {
    const raw = [1, 0, 0.5, 1, 0, 0.5];
    const out = quartileScores(raw);
    expect(out.length).toBe(raw.length);
    // Index 0 should match index 3 (both raw 1), etc.
    expect(out[0]).toBe(out[3]);
    expect(out[1]).toBe(out[4]);
    expect(out[2]).toBe(out[5]);
  });
});
