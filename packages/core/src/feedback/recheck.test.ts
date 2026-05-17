import { describe, expect, it } from "vitest";
import type { SuppressionEntry } from "../suppressions.js";
import { resurfacedSuppressions } from "./recheck.js";

const FB: Omit<SuppressionEntry, "fingerprint" | "type" | "reason"> = {
  created_at: "x",
  source: "feedback",
};

describe("resurfacedSuppressions", () => {
  it("returns nothing when no entries are feedback-sourced", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "x::a.ts::foo",
          type: "x",
          reason: "manual",
          created_at: "x",
          source: "manual",
          crimes_version_pinned: "0.5",
        },
      ],
      "0.7.0",
    );
    expect(result).toEqual([]);
  });

  it("filters feedback entries whose pinned minor is older than current", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "direct_date::a.ts::",
          type: "direct_date",
          reason: "test-file injection",
          ...FB,
          crimes_version_pinned: "0.6",
        },
        {
          fingerprint: "large_function::b.ts::foo",
          type: "large_function",
          reason: "DSL chain",
          ...FB,
          crimes_version_pinned: "0.7",
        },
      ],
      "0.7.0",
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.fingerprint).toBe("direct_date::a.ts::");
    expect(result[0]!.crimes_version_pinned).toBe("0.6");
  });

  it("attaches the release-notes hint for (type, currentMinor)", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "direct_date::a.ts::",
          type: "direct_date",
          reason: "r",
          ...FB,
          crimes_version_pinned: "0.6",
        },
      ],
      "0.7.0",
    );
    expect(result[0]!.hint).toMatch(/skips test files/);
  });

  it("falls back to the generic hint when no release note exists", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "brand_new::a.ts::",
          type: "brand_new",
          reason: "r",
          ...FB,
          crimes_version_pinned: "0.6",
        },
      ],
      "0.7.0",
    );
    expect(result[0]!.hint).toMatch(/Re-confirm or mark resolved/);
  });

  it("filters by detector when --detector is supplied", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "direct_date::a.ts::",
          type: "direct_date",
          reason: "r",
          ...FB,
          crimes_version_pinned: "0.6",
        },
        {
          fingerprint: "large_function::b.ts::foo",
          type: "large_function",
          reason: "r",
          ...FB,
          crimes_version_pinned: "0.6",
        },
      ],
      "0.7.0",
      { detector: "large_function" },
    );
    expect(result.map((r) => r.type)).toEqual(["large_function"]);
  });

  it("skips entries with no crimes_version_pinned (malformed feedback)", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "x::a.ts::",
          type: "x",
          reason: "r",
          ...FB,
        },
      ],
      "0.7.0",
    );
    expect(result).toEqual([]);
  });

  it("does not resurface future-pinned entries (downgrade scenario)", () => {
    const result = resurfacedSuppressions(
      [
        {
          fingerprint: "x::a.ts::",
          type: "x",
          reason: "r",
          ...FB,
          crimes_version_pinned: "0.8",
        },
      ],
      "0.7.0",
    );
    expect(result).toEqual([]);
  });
});
