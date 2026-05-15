import type { ScanReport } from "@crimes/core";
import { describe, expect, it } from "vitest";
import { formatHumanReport } from "./human.js";
import { formatJsonReport } from "./json.js";

const sampleReport: ScanReport = {
  schema_version: "0.1.0",
  repo: { name: "demo", root: "/tmp/demo" },
  summary: { total: 2, high: 1, medium: 1, low: 0 },
  findings: [
    {
      id: "crime_00001",
      type: "large_function",
      charge: "God Function",
      severity: "high",
      confidence: 0.9,
      file: "src/billing.ts",
      symbol: "generateInvoice",
      lines: [10, 250],
      summary: "Function is 241 lines long.",
      evidence: ["241 lines", "4× threshold"],
      scores: { severity: 0.9, confidence: 0.9 },
    },
    {
      id: "crime_00002",
      type: "todo_density",
      charge: "Unfinished Business",
      severity: "medium",
      confidence: 0.95,
      file: "src/todo.ts",
      summary: "12 markers (387 per 1k LOC).",
      evidence: ["8× TODO", "4× FIXME"],
      scores: { severity: 0.5, confidence: 0.95 },
    },
  ],
};

describe("formatHumanReport", () => {
  it("includes charge, summary, and evidence", () => {
    const out = formatHumanReport(sampleReport, { noColor: true });
    expect(out).toContain("CRIME SCENE REPORT");
    expect(out).toContain("God Function");
    expect(out).toContain("generateInvoice");
    expect(out).toContain("241 lines");
    expect(out).toContain("crime_00001");
  });

  it("shows a 'no crimes' message for empty reports", () => {
    const empty: ScanReport = {
      ...sampleReport,
      summary: { total: 0, high: 0, medium: 0, low: 0 },
      findings: [],
    };
    const out = formatHumanReport(empty, { noColor: true });
    expect(out).toContain("No crimes detected");
  });
});

describe("formatJsonReport", () => {
  it("round-trips through JSON.parse", () => {
    const out = formatJsonReport(sampleReport);
    const parsed = JSON.parse(out) as ScanReport;
    expect(parsed.schema_version).toBe("0.1.0");
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0]!.id).toBe("crime_00001");
  });
});
