import { describe, expect, it } from "vitest";
import { normaliseSince, parseGitLog } from "./churn.js";

describe("normaliseSince", () => {
  it.each([
    ["90d", "90 days ago"],
    ["1d", "1 days ago"],
    ["2w", "2 weeks ago"],
    ["6m", "6 months ago"],
    ["1y", "1 years ago"],
    [" 30D ", "30 days ago"],
  ])("expands %s to %s", (input, expected) => {
    expect(normaliseSince(input)).toBe(expected);
  });

  it("passes phrases through unchanged so git can parse them", () => {
    expect(normaliseSince("2 weeks ago")).toBe("2 weeks ago");
    expect(normaliseSince("2026-01-01")).toBe("2026-01-01");
  });

  it("passes through anything that doesn't match the compact pattern", () => {
    expect(normaliseSince("90days")).toBe("90days");
    expect(normaliseSince("nonsense")).toBe("nonsense");
  });
});

describe("parseGitLog", () => {
  it("returns an empty list for empty output", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n\n")).toEqual([]);
  });

  it("counts repeat files across multiple commits", () => {
    const output = [
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00",
      "src/a.ts",
      "src/b.ts",
      "",
      "CRIMES_COMMIT 2026-05-10T09:00:00+00:00",
      "src/a.ts",
      "",
      "CRIMES_COMMIT 2026-05-01T08:00:00+00:00",
      "src/a.ts",
      "src/c.ts",
      "",
    ].join("\n");

    const parsed = parseGitLog(output);
    const a = parsed.find((f) => f.file === "src/a.ts");
    const b = parsed.find((f) => f.file === "src/b.ts");
    const c = parsed.find((f) => f.file === "src/c.ts");

    expect(a?.changeCount).toBe(3);
    expect(a?.latestChange).toBe("2026-05-15T10:00:00+00:00");
    expect(b?.changeCount).toBe(1);
    expect(b?.latestChange).toBe("2026-05-15T10:00:00+00:00");
    expect(c?.changeCount).toBe(1);
    expect(c?.latestChange).toBe("2026-05-01T08:00:00+00:00");
  });

  it("sorts by change_count desc, then file asc", () => {
    const output = [
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00",
      "src/z.ts",
      "src/a.ts",
      "",
      "CRIMES_COMMIT 2026-05-10T09:00:00+00:00",
      "src/a.ts",
      "",
      "CRIMES_COMMIT 2026-05-01T08:00:00+00:00",
      "src/a.ts",
      "src/m.ts",
      "",
    ].join("\n");

    const parsed = parseGitLog(output);
    expect(parsed.map((p) => p.file)).toEqual([
      "src/a.ts", // 3
      "src/m.ts", // 1
      "src/z.ts", // 1
    ]);
  });

  it("ignores stray lines that appear before any commit marker", () => {
    const output = [
      "some-stray-line.ts",
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00",
      "src/a.ts",
      "",
    ].join("\n");
    const parsed = parseGitLog(output);
    expect(parsed.map((p) => p.file)).toEqual(["src/a.ts"]);
  });

  it("tolerates merge commits with no file paths", () => {
    const output = [
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00",
      "",
      "CRIMES_COMMIT 2026-05-10T09:00:00+00:00",
      "src/a.ts",
      "",
    ].join("\n");
    const parsed = parseGitLog(output);
    expect(parsed).toEqual([
      { file: "src/a.ts", changeCount: 1, latestChange: "2026-05-10T09:00:00+00:00" },
    ]);
  });

  it("handles CRLF line endings emitted by git on Windows", () => {
    const output = [
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00\r",
      "src/a.ts\r",
      "\r",
      "CRIMES_COMMIT 2026-05-10T09:00:00+00:00\r",
      "src/a.ts\r",
      "\r",
    ].join("\n");
    const parsed = parseGitLog(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.changeCount).toBe(2);
    expect(parsed[0]!.file).toBe("src/a.ts");
  });

  it("uses the newest date even when commits are not strictly ordered", () => {
    const output = [
      "CRIMES_COMMIT 2026-05-01T08:00:00+00:00",
      "src/a.ts",
      "",
      "CRIMES_COMMIT 2026-05-15T10:00:00+00:00",
      "src/a.ts",
      "",
    ].join("\n");
    const parsed = parseGitLog(output);
    expect(parsed[0]!.latestChange).toBe("2026-05-15T10:00:00+00:00");
  });
});
