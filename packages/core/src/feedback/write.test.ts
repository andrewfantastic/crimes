import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFeedback } from "./read.js";
import { writeFeedbackEntry } from "./write.js";

async function tempPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-feedback-write-"));
  return join(dir, "feedback.jsonl");
}

describe("writeFeedbackEntry", () => {
  it("creates the parent directory and writes one JSONL line", async () => {
    const path = await tempPath();
    const result = await writeFeedbackEntry(
      path,
      {
        crimes_version: "0.7.0",
        fingerprint: "large_function::src/a.ts::foo",
        finding_type: "large_function",
        verdict: "fp",
        note: "Commander DSL chain",
        scan_hash: null,
        resurfaced_from: null,
      },
      { now: () => new Date("2026-05-20T12:00:00.000Z") },
    );

    expect(result.entry.timestamp).toBe("2026-05-20T12:00:00.000Z");
    const raw = readFileSync(path, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw.trim());
    expect(parsed.verdict).toBe("fp");
    expect(parsed.fingerprint).toBe("large_function::src/a.ts::foo");
  });

  it("appends multiple entries on subsequent calls (history preserved)", async () => {
    const path = await tempPath();
    await writeFeedbackEntry(
      path,
      {
        crimes_version: "0.7.0",
        fingerprint: "x::a.ts::foo",
        finding_type: "x",
        verdict: "fp",
        note: "first",
        scan_hash: null,
        resurfaced_from: null,
      },
      { now: () => new Date("2026-05-01T00:00:00.000Z") },
    );
    await writeFeedbackEntry(
      path,
      {
        crimes_version: "0.7.0",
        fingerprint: "x::a.ts::foo",
        finding_type: "x",
        verdict: "tp",
        note: "I was wrong, this is real",
        scan_hash: null,
        resurfaced_from: null,
      },
      { now: () => new Date("2026-05-02T00:00:00.000Z") },
    );

    const read = await readFeedback(path);
    expect(read.entries).toHaveLength(2);
    expect(read.entries[0]!.verdict).toBe("fp");
    expect(read.entries[1]!.verdict).toBe("tp");
  });

  it("round-trips the scan_hash and resurfaced_from fields", async () => {
    const path = await tempPath();
    await writeFeedbackEntry(path, {
      crimes_version: "0.7.0",
      fingerprint: "y::b.ts::bar",
      finding_type: "y",
      verdict: "fp",
      note: "still wrong",
      scan_hash: "sha256:deadbeef",
      resurfaced_from: "0.6",
    });
    const read = await readFeedback(path);
    expect(read.entries[0]!.scan_hash).toBe("sha256:deadbeef");
    expect(read.entries[0]!.resurfaced_from).toBe("0.6");
  });
});
