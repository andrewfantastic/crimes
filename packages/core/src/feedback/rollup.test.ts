import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendToGlobalRollup } from "./rollup.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "crimes-rollup-"));
}

const ENTRY_LINE = JSON.stringify({
  timestamp: "2026-05-20T12:00:00.000Z",
  crimes_version: "0.7.0",
  fingerprint: "large_function::src/a.ts::foo",
  finding_type: "large_function",
  verdict: "fp",
  note: "DSL chain",
  scan_hash: null,
  resurfaced_from: null,
});

describe("appendToGlobalRollup", () => {
  it("is a no-op when the local file does not exist", async () => {
    const dir = await tempDir();
    const result = await appendToGlobalRollup({
      localPath: join(dir, "missing.jsonl"),
      globalPath: join(dir, "rollup.jsonl"),
      repo: "/repo-a",
    });
    expect(result).toEqual({ appended: 0, skipped: 0 });
    expect(existsSync(join(dir, "rollup.jsonl"))).toBe(false);
  });

  it("appends every entry on first run, stamping repo", async () => {
    const dir = await tempDir();
    const local = join(dir, "feedback.jsonl");
    const global = join(dir, "rollup.jsonl");
    await writeFile(local, `${ENTRY_LINE}\n${ENTRY_LINE}\n`, "utf8");

    const result = await appendToGlobalRollup({
      localPath: local,
      globalPath: global,
      repo: "/Users/andrew/dev/crimes",
    });
    // Two identical lines in local → same dedupe key — only one appends.
    expect(result.appended).toBe(1);
    expect(result.skipped).toBe(1);

    const raw = readFileSync(global, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.repo).toBe("/Users/andrew/dev/crimes");
  });

  it("is idempotent across runs (dedupe by repo+timestamp+fingerprint)", async () => {
    const dir = await tempDir();
    const local = join(dir, "feedback.jsonl");
    const global = join(dir, "rollup.jsonl");
    await writeFile(local, `${ENTRY_LINE}\n`, "utf8");

    const first = await appendToGlobalRollup({
      localPath: local,
      globalPath: global,
      repo: "/repo-a",
    });
    expect(first).toEqual({ appended: 1, skipped: 0 });

    const second = await appendToGlobalRollup({
      localPath: local,
      globalPath: global,
      repo: "/repo-a",
    });
    expect(second).toEqual({ appended: 0, skipped: 1 });

    const lines = readFileSync(global, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("treats two different repos as separate entries", async () => {
    const dir = await tempDir();
    const local = join(dir, "feedback.jsonl");
    const global = join(dir, "rollup.jsonl");
    await writeFile(local, `${ENTRY_LINE}\n`, "utf8");

    await appendToGlobalRollup({
      localPath: local,
      globalPath: global,
      repo: "/repo-a",
    });
    await appendToGlobalRollup({
      localPath: local,
      globalPath: global,
      repo: "/repo-b",
    });
    const lines = readFileSync(global, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).repo).toBe("/repo-a");
    expect(JSON.parse(lines[1]!).repo).toBe("/repo-b");
  });
});
