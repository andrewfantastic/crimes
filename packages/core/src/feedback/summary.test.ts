import { describe, expect, it } from "vitest";
import { buildFeedbackSummary } from "./summary.js";
import type { FeedbackEntry } from "./types.js";

function entry(
  partial: Partial<FeedbackEntry> & {
    fingerprint: string;
    verdict: FeedbackEntry["verdict"];
  },
): FeedbackEntry {
  return {
    timestamp: "2026-05-20T12:00:00.000Z",
    crimes_version: "0.7.0",
    fingerprint: partial.fingerprint,
    finding_type: partial.fingerprint.split("::")[0]!,
    verdict: partial.verdict,
    note: partial.note ?? null,
    scan_hash: partial.scan_hash ?? null,
    resurfaced_from: partial.resurfaced_from ?? null,
    ...(partial.repo !== undefined ? { repo: partial.repo } : {}),
    ...(partial.timestamp ? { timestamp: partial.timestamp } : {}),
    ...(partial.crimes_version ? { crimes_version: partial.crimes_version } : {}),
  };
}

describe("buildFeedbackSummary", () => {
  it("counts by verdict using latest-per-fingerprint (history collapsed)", () => {
    const entries: FeedbackEntry[] = [
      entry({
        fingerprint: "x::a.ts::foo",
        verdict: "fp",
        timestamp: "2026-05-01T00:00:00.000Z",
      }),
      entry({
        fingerprint: "x::a.ts::foo",
        verdict: "tp",
        timestamp: "2026-05-02T00:00:00.000Z",
      }),
      entry({ fingerprint: "y::b.ts::bar", verdict: "fp" }),
    ];
    const s = buildFeedbackSummary(entries);
    expect(s.total).toBe(2);
    expect(s.by_verdict).toEqual({ tp: 1, fp: 1, known: 0 });
  });

  it("groups by detector with per-verdict subcounts", () => {
    const entries: FeedbackEntry[] = [
      entry({ fingerprint: "large_function::a.ts::foo", verdict: "fp" }),
      entry({ fingerprint: "large_function::b.ts::bar", verdict: "fp" }),
      entry({ fingerprint: "large_function::c.ts::baz", verdict: "tp" }),
      entry({ fingerprint: "direct_date::d.ts::", verdict: "known" }),
    ];
    const s = buildFeedbackSummary(entries);
    expect(s.by_detector.large_function).toEqual({ tp: 1, fp: 2, known: 0 });
    expect(s.by_detector.direct_date).toEqual({ tp: 0, fp: 0, known: 1 });
  });

  it("tracks counts per crimes_version", () => {
    const entries: FeedbackEntry[] = [
      entry({
        fingerprint: "a::a.ts::a",
        verdict: "fp",
        crimes_version: "0.6.0",
      }),
      entry({
        fingerprint: "b::b.ts::b",
        verdict: "tp",
        crimes_version: "0.7.0",
      }),
      entry({
        fingerprint: "c::c.ts::c",
        verdict: "tp",
        crimes_version: "0.7.0",
      }),
    ];
    const s = buildFeedbackSummary(entries);
    expect(s.by_version).toEqual({ "0.6.0": 1, "0.7.0": 2 });
  });

  it("adds by_repo when entries carry a repo field (global rollup)", () => {
    const entries: FeedbackEntry[] = [
      entry({ fingerprint: "x::a.ts::foo", verdict: "fp", repo: "/repo-a" }),
      entry({ fingerprint: "y::b.ts::bar", verdict: "tp", repo: "/repo-a" }),
      entry({ fingerprint: "z::c.ts::baz", verdict: "fp", repo: "/repo-b" }),
    ];
    const s = buildFeedbackSummary(entries);
    expect(s.by_repo).toEqual({ "/repo-a": 2, "/repo-b": 1 });
  });

  it("omits by_repo for local (repo-less) entries", () => {
    const entries: FeedbackEntry[] = [
      entry({ fingerprint: "x::a.ts::foo", verdict: "fp" }),
    ];
    const s = buildFeedbackSummary(entries);
    expect(s.by_repo).toBeUndefined();
  });

  it("returns zeros on empty input", () => {
    const s = buildFeedbackSummary([]);
    expect(s.total).toBe(0);
    expect(s.by_verdict).toEqual({ tp: 0, fp: 0, known: 0 });
  });
});
