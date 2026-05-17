import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "..", "..", "dist", "index.js");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "number") {
          resolvePromise({ stdout, stderr, exitCode: error.code });
          return;
        }
        if (error && (error as NodeJS.ErrnoException).code !== undefined) {
          resolvePromise({
            stdout,
            stderr: `${stderr}\nspawn error: ${error.message}`,
            exitCode: -1,
          });
          return;
        }
        resolvePromise({ stdout, stderr, exitCode: 0 });
      },
    );
  });
}

function largeFunctionSource(name = "generateInvoice"): string {
  const body = Array.from(
    { length: 200 },
    (_, i) => `  const v${i} = ${i};`,
  ).join("\n");
  return `export function ${name}() {\n${body}\n  return 0;\n}\n`;
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crimes-feedback-"));
  await writeFile(join(root, "billing.ts"), largeFunctionSource(), "utf8");
  return root;
}

const FP = "large_function::billing.ts::generateInvoice";

describe("crimes feedback (write)", () => {
  it("missing <fingerprint> exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(["feedback"], root);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("requires <fingerprint-or-id>");
  });

  it("missing --verdict exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(["feedback", FP], root);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--verdict is required");
  });

  it("--verdict fp without --note exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(["feedback", FP, "--verdict", "fp"], root);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "--note is required when --verdict is fp",
    );
  });

  it("invalid verdict exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(
      ["feedback", FP, "--verdict", "maybe"],
      root,
    );
    expect(result.exitCode).toBe(2);
  });

  it("invalid fingerprint shape exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(
      ["feedback", "not-a-fingerprint", "--verdict", "tp"],
      root,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("neither a per-scan id");
  });

  it("crime_NNNNN id without --file exits 2", async () => {
    const root = await makeRepo();
    const result = await runCli(
      ["feedback", "crime_00001", "--verdict", "tp"],
      root,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--file <scan.json> is required");
  });

  it("--verdict fp writes a JSONL entry AND a feedback-sourced suppression", async () => {
    const root = await makeRepo();
    const result = await runCli(
      [
        "feedback",
        FP,
        "--verdict",
        "fp",
        "--note",
        "Builder pattern — DSL chain, not mixed responsibilities",
      ],
      root,
    );
    expect(result.exitCode).toBe(0);

    const feedbackPath = join(root, ".crimes", "feedback.jsonl");
    expect(existsSync(feedbackPath)).toBe(true);
    const lines = readFileSync(feedbackPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.verdict).toBe("fp");
    expect(entry.fingerprint).toBe(FP);
    expect(entry.finding_type).toBe("large_function");
    expect(entry.note).toContain("Builder pattern");

    const suppPath = join(root, ".crimes", "suppressions.json");
    expect(existsSync(suppPath)).toBe(true);
    const doc = JSON.parse(readFileSync(suppPath, "utf8"));
    expect(doc.suppressions).toHaveLength(1);
    expect(doc.suppressions[0].source).toBe("feedback");
    expect(doc.suppressions[0].crimes_version_pinned).toMatch(/^\d+\.\d+$/);
    expect(doc.suppressions[0].reason).toContain("Builder pattern");
  });

  it("--verdict tp on a previously-fp finding removes the feedback suppression and appends a tp line", async () => {
    const root = await makeRepo();
    // First: mark fp.
    await runCli(
      [
        "feedback",
        FP,
        "--verdict",
        "fp",
        "--note",
        "DSL chain",
      ],
      root,
    );
    // Now: mark tp.
    const result = await runCli(
      ["feedback", FP, "--verdict", "tp", "--note", "I was wrong"],
      root,
    );
    expect(result.exitCode).toBe(0);

    const lines = readFileSync(
      join(root, ".crimes", "feedback.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).verdict).toBe("tp");

    const doc = JSON.parse(
      readFileSync(join(root, ".crimes", "suppressions.json"), "utf8"),
    );
    expect(doc.suppressions).toEqual([]);
  });

  it("--verdict known appends an entry but writes no suppression", async () => {
    const root = await makeRepo();
    const result = await runCli(
      ["feedback", FP, "--verdict", "known"],
      root,
    );
    expect(result.exitCode).toBe(0);

    const lines = readFileSync(
      join(root, ".crimes", "feedback.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).verdict).toBe("known");

    expect(existsSync(join(root, ".crimes", "suppressions.json"))).toBe(false);
  });

  it("re-feedback fp on a resurfaced finding records resurfaced_from", async () => {
    const root = await makeRepo();
    // Hand-craft a suppression as if it were written by an earlier minor.
    const suppDir = join(root, ".crimes");
    await writeFile(
      join(root, ".crimes", "suppressions.json").replace(
        join(root, ".crimes", "suppressions.json"),
        join(suppDir, "suppressions.json"),
      ),
      "",
      "utf8",
    ).catch(() => undefined);

    // Write it directly to bypass the CLI for setup.
    const { mkdir, writeFile: wf } = await import("node:fs/promises");
    await mkdir(join(root, ".crimes"), { recursive: true });
    await wf(
      join(root, ".crimes", "suppressions.json"),
      JSON.stringify(
        {
          schema_version: "0.1.0",
          report_type: "suppressions",
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          suppressions: [
            {
              fingerprint: FP,
              type: "large_function",
              file: "billing.ts",
              symbol: "generateInvoice",
              reason: "old reason",
              created_at: "2026-04-01T00:00:00.000Z",
              source: "feedback",
              crimes_version_pinned: "0.5",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCli(
      ["feedback", FP, "--verdict", "fp", "--note", "still a DSL chain"],
      root,
    );
    expect(result.exitCode).toBe(0);

    const lines = readFileSync(
      join(root, ".crimes", "feedback.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry.resurfaced_from).toBe("0.5");
    expect(entry.verdict).toBe("fp");
  });
});
