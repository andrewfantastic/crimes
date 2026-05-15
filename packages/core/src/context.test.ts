import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { context } from "./context.js";

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-context-test-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return dir;
}

describe("context", () => {
  it("returns a schema-versioned report keyed to the requested file", async () => {
    const root = await makeRepo({ "src/x.ts": "export const x = 1;\n" });
    const report = await context({ root, file: "src/x.ts" });

    expect(report.schema_version).toBe("0.1.0");
    expect(report.file).toBe("src/x.ts");
    expect(report.repo.root).toBe(root);
  });

  it("normalises absolute paths to repo-relative", async () => {
    const root = await makeRepo({ "src/x.ts": "export const x = 1;\n" });
    const report = await context({ root, file: join(root, "src/x.ts") });
    expect(report.file).toBe("src/x.ts");
  });

  it("filters findings to just the requested file", async () => {
    const big = Array.from({ length: 800 }, () => "// line").join("\n");
    const root = await makeRepo({
      "src/big.ts": big,
      "src/small.ts": "export const x = 1;\n",
    });

    const report = await context({ root, file: "src/big.ts" });

    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) {
      expect(f.file).toBe("src/big.ts");
    }
  });

  it("rolls risk up to the worst severity present", async () => {
    const big = Array.from({ length: 800 }, () => "// line").join("\n");
    const root = await makeRepo({ "src/big.ts": big });
    const report = await context({ root, file: "src/big.ts" });

    expect(report.risk.level).toBe("high");
    expect(report.risk.high).toBeGreaterThanOrEqual(1);
    expect(report.risk.total).toBe(report.findings.length);
  });

  it("returns risk.level 'none' when there are no findings", async () => {
    const root = await makeRepo({ "src/x.ts": "export const x = 1;\n" });
    const report = await context({ root, file: "src/x.ts" });

    expect(report.findings).toEqual([]);
    expect(report.risk.level).toBe("none");
    expect(report.agent_guidance).toEqual([]);
  });

  it("finds sibling .test.ts files", async () => {
    const root = await makeRepo({
      "src/billing.ts": "export const billing = () => 1;\n",
      "src/billing.test.ts": "import { billing } from './billing';\n",
    });
    const report = await context({ root, file: "src/billing.ts" });
    expect(report.likely_tests).toContain("src/billing.test.ts");
  });

  it("finds .spec.tsx siblings", async () => {
    const root = await makeRepo({
      "src/Btn.tsx": "export const Btn = () => null;\n",
      "src/Btn.spec.tsx": "import { Btn } from './Btn';\n",
    });
    const report = await context({ root, file: "src/Btn.tsx" });
    expect(report.likely_tests).toContain("src/Btn.spec.tsx");
  });

  it("finds tests under __tests__ that match the target basename", async () => {
    const root = await makeRepo({
      "src/billing.ts": "export const billing = () => 1;\n",
      "src/__tests__/billing.test.ts": "import { billing } from '../billing';\n",
    });
    const report = await context({ root, file: "src/billing.ts" });
    expect(report.likely_tests).toContain("src/__tests__/billing.test.ts");
  });

  it("finds test files that import the target via a relative path", async () => {
    const root = await makeRepo({
      "src/billing.ts": "export const billing = () => 1;\n",
      "src/uses-billing.test.ts": "import { billing } from './billing';\n",
    });
    const report = await context({ root, file: "src/billing.ts" });
    expect(report.likely_tests).toContain("src/uses-billing.test.ts");
  });

  it("does not include non-test files even when they import the target", async () => {
    const root = await makeRepo({
      "src/billing.ts": "export const billing = () => 1;\n",
      "src/consumer.ts": "import { billing } from './billing';\n",
    });
    const report = await context({ root, file: "src/billing.ts" });
    expect(report.likely_tests).not.toContain("src/consumer.ts");
  });

  it("emits deterministic agent_guidance keyed off finding types", async () => {
    const date =
      "export const a = " +
      Array.from({ length: 10 }, () => "Date.now()").join(" + ") +
      ";\n";
    const root = await makeRepo({ "src/clock.ts": date });
    const report = await context({ root, file: "src/clock.ts" });

    expect(report.findings.some((f) => f.type === "direct_date")).toBe(true);
    expect(
      report.agent_guidance.some((g) => /clock|inject time/i.test(g)),
    ).toBe(true);
  });

  it("dedupes guidance to one line per finding type", async () => {
    const fn = (name: string): string =>
      `export function ${name}() {\n` +
      Array.from({ length: 100 }, () => "  // body").join("\n") +
      "\n}\n";
    const root = await makeRepo({ "src/big.ts": fn("a") + fn("b") });

    const report = await context({ root, file: "src/big.ts" });
    const fns = report.findings.filter((f) => f.type === "large_function");
    expect(fns.length).toBeGreaterThanOrEqual(2);

    const helperLines = report.agent_guidance.filter((g) =>
      /helpers/i.test(g),
    );
    expect(helperLines).toHaveLength(1);
  });
});
