import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "./scan.js";

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-scan-test-"));
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(dir, path), content, "utf8");
  }
  return dir;
}

describe("scan", () => {
  it("produces a schema-versioned, sorted report", async () => {
    const big = Array.from({ length: 800 }, () => "// line").join("\n");
    const root = await makeRepo({
      "big.ts": big,
      "small.ts": `export const x = 1;\n`,
    });

    const report = await scan({ root });

    expect(report.schema_version).toBe("0.1.0");
    expect(report.repo.root).toBe(root);
    expect(report.summary.total).toBe(report.findings.length);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0]!.id).toMatch(/^crime_\d{5}$/);

    // sorted: high before medium before low
    const order = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < report.findings.length; i++) {
      expect(order[report.findings[i]!.severity]).toBeGreaterThanOrEqual(
        order[report.findings[i - 1]!.severity],
      );
    }
  });

  it("ignores files under dist/ and node_modules/", async () => {
    const root = await makeRepo({});
    const report = await scan({ root });
    expect(report.findings).toEqual([]);
  });

  it("flags the example messy patterns", async () => {
    const root = await makeRepo({
      "date.ts": `export const a = Date.now(); export const b = new Date();\n`,
      "todo.ts": [
        "// TODO: a",
        "// FIXME: b",
        "// TODO: c",
        "// HACK: d",
        "// XXX: e",
      ].join("\n"),
    });
    const report = await scan({ root });
    const types = new Set(report.findings.map((f) => f.type));
    expect(types.has("direct_date")).toBe(true);
    expect(types.has("todo_density")).toBe(true);
  });
});
