import { mkdtemp, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Finding } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import {
  appendSuppression,
  loadSuppressions,
  MalformedSuppressionsError,
  partitionFindings,
} from "./suppressions.js";

async function tempPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-supp-test-"));
  return join(dir, "suppressions.json");
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "crime_00001",
    type: "large_function",
    charge: "God Function",
    severity: "high",
    confidence: 0.9,
    file: "src/billing.ts",
    symbol: "generateInvoice",
    lines: [10, 200],
    summary: "long function",
    evidence: [],
    scores: { severity: 0.9, confidence: 0.9 },
    ...overrides,
  };
}

describe("loadSuppressions", () => {
  it("returns an empty list when the file does not exist", async () => {
    const path = await tempPath();
    const result = loadSuppressions(path);
    expect(result.entries).toEqual([]);
    expect(result.loaded).toBe(false);
  });

  it("round-trips a valid file", async () => {
    const path = await tempPath();
    const doc = {
      schema_version: SCHEMA_VERSION,
      report_type: "suppressions" as const,
      created_at: "2026-05-17T11:30:00.000Z",
      updated_at: "2026-05-17T11:30:00.000Z",
      suppressions: [
        {
          fingerprint: "large_function::src/billing.ts::generateInvoice",
          type: "large_function",
          file: "src/billing.ts",
          symbol: "generateInvoice",
          reason: "tracked in #1234",
          created_at: "2026-05-17T11:30:00.000Z",
        },
      ],
    };
    await writeFile(path, JSON.stringify(doc, null, 2), "utf8");

    const result = loadSuppressions(path);
    expect(result.loaded).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.reason).toBe("tracked in #1234");
  });

  it("throws MalformedSuppressionsError on a malformed file", async () => {
    const path = await tempPath();
    await writeFile(path, "not json", "utf8");
    expect(() => loadSuppressions(path)).toThrowError(
      MalformedSuppressionsError,
    );
  });

  it("rejects missing reason field", async () => {
    const path = await tempPath();
    await writeFile(
      path,
      JSON.stringify({
        schema_version: SCHEMA_VERSION,
        report_type: "suppressions",
        created_at: "x",
        updated_at: "x",
        suppressions: [{ fingerprint: "x::y::z", type: "x", created_at: "x" }],
      }),
      "utf8",
    );
    expect(() => loadSuppressions(path)).toThrowError(
      MalformedSuppressionsError,
    );
  });
});

describe("appendSuppression", () => {
  it("creates the file when it does not exist", async () => {
    const path = await tempPath();
    const result = await appendSuppression(
      path,
      {
        fingerprint: "large_function::src/a.ts::foo",
        type: "large_function",
        file: "src/a.ts",
        symbol: "foo",
        reason: "ok",
      },
      { now: () => new Date("2026-05-17T11:30:00.000Z") },
    );
    expect(result.updated).toBe(false);
    expect(existsSync(path)).toBe(true);

    const reread = loadSuppressions(path);
    expect(reread.entries).toHaveLength(1);
    expect(reread.entries[0]!.fingerprint).toBe(
      "large_function::src/a.ts::foo",
    );
  });

  it("appends a new entry to an existing file", async () => {
    const path = await tempPath();
    await appendSuppression(
      path,
      {
        fingerprint: "x::a.ts::foo",
        type: "x",
        reason: "one",
      },
      { now: () => new Date("2026-05-17T11:30:00.000Z") },
    );
    await appendSuppression(
      path,
      {
        fingerprint: "y::b.ts::bar",
        type: "y",
        reason: "two",
      },
      { now: () => new Date("2026-05-18T11:30:00.000Z") },
    );
    const reread = loadSuppressions(path);
    expect(reread.entries.map((e) => e.fingerprint)).toEqual([
      "x::a.ts::foo",
      "y::b.ts::bar",
    ]);
  });

  it("updates reason and bumps updated_at on an existing fingerprint", async () => {
    const path = await tempPath();
    await appendSuppression(
      path,
      {
        fingerprint: "x::a.ts::foo",
        type: "x",
        reason: "original",
      },
      { now: () => new Date("2026-05-17T11:30:00.000Z") },
    );
    const updated = await appendSuppression(
      path,
      {
        fingerprint: "x::a.ts::foo",
        type: "x",
        reason: "revised",
      },
      { now: () => new Date("2026-05-20T11:30:00.000Z") },
    );
    expect(updated.updated).toBe(true);
    const reread = loadSuppressions(path);
    expect(reread.entries).toHaveLength(1);
    expect(reread.entries[0]!.reason).toBe("revised");
    expect(reread.entries[0]!.created_at).toBe("2026-05-17T11:30:00.000Z");
    expect(updated.document.updated_at).toBe("2026-05-20T11:30:00.000Z");
  });

  it("writes pretty-printed JSON with a trailing newline", async () => {
    const path = await tempPath();
    await appendSuppression(path, {
      fingerprint: "x::a.ts::foo",
      type: "x",
      reason: "ok",
    });
    const raw = readFileSync(path, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("  \"fingerprint\":");
  });
});

describe("end-to-end scan suppression", () => {
  it("removes suppressed findings + recomputes summary + sets suppressed_count", async () => {
    const { mkdtemp: mkdtempFn } = await import("node:fs/promises");
    const root = await mkdtempFn(join(tmpdir(), "crimes-scan-supp-e2e-"));
    const { writeFile: wf } = await import("node:fs/promises");

    const body = Array.from(
      { length: 200 },
      (_, i) => `  const v${i} = ${i};`,
    ).join("\n");
    await wf(
      join(root, "billing.ts"),
      `export function generateInvoice() {\n${body}\n  return 0;\n}\n`,
      "utf8",
    );

    const { scan, applySuppressionsToScan, applyScanFailOn } = await import(
      "./scan.js"
    );
    const report = await scan({ root });
    expect(report.summary.high).toBeGreaterThan(0);

    const filtered = applySuppressionsToScan(
      report,
      [
        {
          fingerprint: "large_function::billing.ts::generateInvoice",
          type: "large_function",
          reason: "ok",
          created_at: "x",
        },
      ],
      { showSuppressed: false },
    );
    expect(filtered.suppressed_count).toBe(1);
    expect(filtered.findings.find((f) => f.type === "large_function")).toBeUndefined();

    // Gate must not fire on a suppressed finding.
    const gated = applyScanFailOn(filtered, "high");
    expect(gated.failed).toBe(false);
  });

  it("--show-suppressed retains annotated findings but gate still ignores them", async () => {
    const { applyScanFailOn, applySuppressionsToScan } = await import(
      "./scan.js"
    );
    const report = {
      schema_version: SCHEMA_VERSION,
      report_type: "scan" as const,
      repo: { name: "x", root: "/x" },
      summary: { total: 1, high: 1, medium: 0, low: 0 },
      findings: [makeFinding()],
    };
    const filtered = applySuppressionsToScan(
      report,
      [
        {
          fingerprint: "large_function::src/billing.ts::generateInvoice",
          type: "large_function",
          reason: "legacy",
          created_at: "x",
        },
      ],
      { showSuppressed: true },
    );
    expect(filtered.findings).toHaveLength(1);
    expect(filtered.findings[0]!.suppressed).toBe(true);
    const gated = applyScanFailOn(filtered, "high");
    expect(gated.failed).toBe(false);
  });
});

describe("partitionFindings", () => {
  it("is the identity when no suppressions are configured", () => {
    const findings = [makeFinding()];
    const { visible, suppressedCount } = partitionFindings(findings, [], {
      showSuppressed: false,
    });
    expect(visible).toEqual(findings);
    expect(suppressedCount).toBe(0);
  });

  it("removes matched findings when showSuppressed: false", () => {
    const findings = [
      makeFinding(),
      makeFinding({
        type: "large_file",
        file: "src/other.ts",
        symbol: undefined,
      }),
    ];
    const { visible, suppressedCount } = partitionFindings(
      findings,
      [
        {
          fingerprint: "large_function::src/billing.ts::generateInvoice",
          type: "large_function",
          reason: "ok",
          created_at: "x",
        },
      ],
      { showSuppressed: false },
    );
    expect(suppressedCount).toBe(1);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.type).toBe("large_file");
  });

  it("annotates matched findings when showSuppressed: true", () => {
    const findings = [makeFinding()];
    const { visible, suppressedCount } = partitionFindings(
      findings,
      [
        {
          fingerprint: "large_function::src/billing.ts::generateInvoice",
          type: "large_function",
          reason: "legacy module",
          created_at: "x",
        },
      ],
      { showSuppressed: true },
    );
    expect(suppressedCount).toBe(1);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.suppressed).toBe(true);
    expect(visible[0]!.suppression_reason).toBe("legacy module");
  });

  it("leaves unmatched findings untouched", () => {
    const findings = [makeFinding()];
    const { visible, suppressedCount } = partitionFindings(
      findings,
      [
        {
          fingerprint: "other_type::src/other.ts::other",
          type: "other_type",
          reason: "ok",
          created_at: "x",
        },
      ],
      { showSuppressed: false },
    );
    expect(suppressedCount).toBe(0);
    expect(visible).toEqual(findings);
  });
});
