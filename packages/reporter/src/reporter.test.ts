import type { ContextReport, DiffReport, ScanReport } from "@crimes/core";
import { describe, expect, it } from "vitest";
import {
  formatContextHumanReport,
  formatDiffReport,
  formatHumanReport,
} from "./human.js";
import {
  formatContextJsonReport,
  formatDiffJsonReport,
  formatJsonReport,
} from "./json.js";

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

const sampleContext: ContextReport = {
  schema_version: "0.1.0",
  repo: { name: "demo", root: "/tmp/demo" },
  file: "src/billing.ts",
  risk: { level: "high", high: 1, medium: 1, low: 0, total: 2 },
  findings: [
    {
      id: "crime_00001",
      type: "large_function",
      charge: "God Function",
      severity: "high",
      confidence: 0.95,
      file: "src/billing.ts",
      symbol: "generateInvoice",
      lines: [37, 240],
      summary: "generateInvoice spans 204 lines.",
      evidence: ["lines 37–240 (204 lines)"],
      scores: { severity: 0.9, confidence: 0.95 },
    },
    {
      id: "crime_00002",
      type: "todo_density",
      charge: "Unfinished Business",
      severity: "medium",
      confidence: 0.7,
      file: "src/billing.ts",
      lines: [5, 200],
      summary: "10 TODO/FIXME markers.",
      evidence: ["10× TODO"],
      scores: { severity: 0.4, confidence: 0.7 },
    },
  ],
  likely_tests: ["src/billing.test.ts", "src/__tests__/billing.test.ts"],
  agent_guidance: [
    "Prefer extracting pure helpers before adding more branches.",
    "Review TODOs before relying on comments as current intent.",
  ],
};

describe("formatContextJsonReport", () => {
  it("includes every required key", () => {
    const out = formatContextJsonReport(sampleContext);
    const parsed = JSON.parse(out) as Record<string, unknown>;

    for (const key of [
      "schema_version",
      "file",
      "risk",
      "findings",
      "likely_tests",
      "agent_guidance",
    ]) {
      expect(parsed).toHaveProperty(key);
    }

    expect(parsed.schema_version).toBe("0.1.0");
    expect(parsed.file).toBe("src/billing.ts");
  });

  it("preserves arrays exactly", () => {
    const out = formatContextJsonReport(sampleContext);
    const parsed = JSON.parse(out) as ContextReport;
    expect(parsed.likely_tests).toEqual([
      "src/billing.test.ts",
      "src/__tests__/billing.test.ts",
    ]);
    expect(parsed.agent_guidance).toHaveLength(2);
    expect(parsed.findings).toHaveLength(2);
  });
});

describe("formatContextHumanReport", () => {
  it("renders the file, risk level, findings, guidance, and tests", () => {
    const out = formatContextHumanReport(sampleContext, { noColor: true });

    expect(out).toContain("src/billing.ts");
    expect(out).toContain("HIGH");
    expect(out).toContain("God Function");
    expect(out).toContain("generateInvoice");
    expect(out).toContain("crime_00001");
    expect(out).toContain("Prefer extracting pure helpers");
    expect(out).toContain("src/billing.test.ts");
    expect(out).toContain("src/__tests__/billing.test.ts");
  });

  it("handles a clean file with no findings or tests", () => {
    const clean: ContextReport = {
      ...sampleContext,
      risk: { level: "none", high: 0, medium: 0, low: 0, total: 0 },
      findings: [],
      likely_tests: [],
      agent_guidance: [],
    };
    const out = formatContextHumanReport(clean, { noColor: true });
    expect(out).toContain("src/billing.ts");
    expect(out).toMatch(/no findings|clean|none/i);
    expect(out).toMatch(/no .*test|tests: none|no likely tests/i);
  });
});

const sampleDiff: DiffReport = {
  schema_version: "0.1.0",
  report_type: "diff",
  repo: { name: "demo", root: "/tmp/demo" },
  base: "main",
  head: "HEAD",
  summary: { new: 2, fixed: 1, unchanged: 8 },
  new_findings: [
    {
      id: "crime_00001",
      type: "large_function",
      charge: "God Function",
      severity: "high",
      confidence: 0.9,
      file: "src/new.ts",
      symbol: "fresh",
      lines: [1, 90],
      summary: "...",
      evidence: ["90 lines"],
      scores: { severity: 0.9, confidence: 0.9 },
    },
    {
      id: "crime_00002",
      type: "todo_density",
      charge: "Unfinished Business",
      severity: "medium",
      confidence: 0.8,
      file: "src/new.ts",
      lines: [1, 30],
      summary: "...",
      evidence: ["6× TODO"],
      scores: { severity: 0.5, confidence: 0.8 },
    },
  ],
  fixed_findings: [
    {
      id: "crime_00003",
      type: "large_function",
      charge: "God Function",
      severity: "high",
      confidence: 0.95,
      file: "src/deleted.ts",
      symbol: "removed",
      lines: [1, 90],
      summary: "...",
      evidence: ["90 lines"],
      scores: { severity: 0.9, confidence: 0.95 },
    },
  ],
  unchanged_findings: [],
};

describe("formatDiffReport", () => {
  it("renders the concise CRIMES DIFF block", () => {
    const out = formatDiffReport(sampleDiff, { noColor: true });
    expect(out).toContain("CRIMES DIFF");
    expect(out).toContain("base: main");
    expect(out).toContain("head: HEAD");
    expect(out).toContain("New crimes: 2");
    expect(out).toContain("Fixed crimes: 1");
    expect(out).toContain("Unchanged crimes: 8");
  });

  it("uses the literal counts from the report summary", () => {
    const zero: DiffReport = {
      ...sampleDiff,
      summary: { new: 0, fixed: 0, unchanged: 0 },
      new_findings: [],
      fixed_findings: [],
    };
    const out = formatDiffReport(zero, { noColor: true });
    expect(out).toContain("New crimes: 0");
    expect(out).toContain("Fixed crimes: 0");
    expect(out).toContain("Unchanged crimes: 0");
  });
});

describe("formatDiffJsonReport", () => {
  it("includes every required key", () => {
    const parsed = JSON.parse(formatDiffJsonReport(sampleDiff)) as Record<
      string,
      unknown
    >;
    for (const key of [
      "schema_version",
      "report_type",
      "repo",
      "base",
      "head",
      "summary",
      "new_findings",
      "fixed_findings",
      "unchanged_findings",
    ]) {
      expect(parsed).toHaveProperty(key);
    }
    expect(parsed.schema_version).toBe("0.1.0");
    expect(parsed.report_type).toBe("diff");
  });

  it("preserves finding groups as arrays of the same Finding shape", () => {
    const parsed = JSON.parse(formatDiffJsonReport(sampleDiff)) as DiffReport;
    expect(parsed.new_findings).toHaveLength(2);
    expect(parsed.fixed_findings).toHaveLength(1);
    expect(parsed.new_findings[0]!.charge).toBe("God Function");
    expect(parsed.fixed_findings[0]!.file).toBe("src/deleted.ts");
  });
});
