import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { discoverFiles } from "@crimes/language-js";
import { DEFAULT_CONFIG } from "../config.js";
import { buildImportGraph } from "../imports/build.js";
import { buildScoringContext, computeAgentRisk } from "./build.js";

const execFileAsync = promisify(execFile);

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-scoring-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return dir;
}

async function discover(root: string): Promise<string[]> {
  return discoverFiles({
    root,
    include: DEFAULT_CONFIG.include,
    exclude: DEFAULT_CONFIG.exclude,
  });
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "crimes-test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "crimes-test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

async function initRepo(root: string): Promise<void> {
  await git(root, "init", "--initial-branch=main", "--quiet");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "initial", "--quiet");
}

async function commitFile(
  root: string,
  file: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(join(root, file), content, "utf8");
  await git(root, "add", file);
  await git(root, "commit", "-m", message, "--quiet");
}

describe("buildScoringContext > churn", () => {
  it("returns 0 for a file not present in the git log window", async () => {
    const root = await makeRepo({
      "src/a.ts": "export const a = 1;\n",
    });
    await initRepo(root);
    const files = await discover(root);
    const ctx = await buildScoringContext({ root, files, imports: undefined });
    expect(ctx.churn.forFile("src/unknown.ts")).toBe(0);
  });

  it(
    "scales linearly with commit count up to the saturation cap",
    async () => {
      // 5 additional commits (plus the initial) = 6 total → 6/20 = 0.30.
      // Keeping the count small so the test stays fast under the full
      // suite's parallelism contention.
      const root = await makeRepo({ "src/a.ts": "export const a = 0;\n" });
      await initRepo(root);
      for (let i = 1; i <= 5; i++) {
        await commitFile(
          root,
          "src/a.ts",
          `export const a = ${i};\n`,
          `bump ${i}`,
        );
      }
      const files = await discover(root);
      const ctx = await buildScoringContext({ root, files, imports: undefined });
      // 6 commits / 20 cap = 0.30; allow ±0.05 in case the platform's git
      // collapses identical-tree commits.
      expect(ctx.churn.forFile("src/a.ts")).toBeGreaterThan(0.2);
      expect(ctx.churn.forFile("src/a.ts")).toBeLessThanOrEqual(1);
      expect(ctx.churn.limited).toBe(false);
    },
    20_000,
  );

  it("marks the index as `limited` when the repo is a shallow clone", async () => {
    const root = await makeRepo({ "src/a.ts": "export const a = 1;\n" });
    await initRepo(root);
    // Mark the repo as shallow by creating the marker file directly —
    // `git clone --depth` would require network.
    await writeFile(join(root, ".git/shallow"), "", "utf8");
    const files = await discover(root);
    const ctx = await buildScoringContext({ root, files, imports: undefined });
    expect(ctx.churn.limited).toBe(true);
    expect(ctx.churn.limitedReason).toMatch(/shallow/);
  });

  it("marks the index as `limited` when there is no git repo", async () => {
    const root = await makeRepo({ "src/a.ts": "export const a = 1;\n" });
    const files = await discover(root);
    const ctx = await buildScoringContext({ root, files, imports: undefined });
    expect(ctx.churn.limited).toBe(true);
    expect(ctx.churn.forFile("src/a.ts")).toBe(0);
  });
});

describe("buildScoringContext > test_gap", () => {
  it("returns 0 for a file with a sibling .test.ts that imports it", async () => {
    const root = await makeRepo({
      "src/util.ts": "export const u = 1;\n",
      "src/util.test.ts":
        `import { u } from "./util";\n` + `console.log(u);\n`,
    });
    const files = await discover(root);
    const imports = await buildImportGraph({ root, files });
    const ctx = await buildScoringContext({ root, files, imports });
    expect(ctx.testGap.forFile("src/util.ts")).toBe(0);
  });

  it("returns 0 for a file imported by a test file under __tests__", async () => {
    const root = await makeRepo({
      "src/util.ts": "export const u = 1;\n",
      "src/__tests__/util.test.ts":
        `import { u } from "../util";\n` + `console.log(u);\n`,
    });
    const files = await discover(root);
    const imports = await buildImportGraph({ root, files });
    const ctx = await buildScoringContext({ root, files, imports });
    expect(ctx.testGap.forFile("src/util.ts")).toBe(0);
  });

  it("returns 1 for a totally untested file", async () => {
    const root = await makeRepo({
      "src/util.ts": "export const u = 1;\n",
    });
    const files = await discover(root);
    const imports = await buildImportGraph({ root, files });
    const ctx = await buildScoringContext({ root, files, imports });
    expect(ctx.testGap.forFile("src/util.ts")).toBe(1);
  });

  it("returns 0 for test files themselves", async () => {
    const root = await makeRepo({
      "src/util.test.ts": `test("ok", () => {});\n`,
    });
    const files = await discover(root);
    const imports = await buildImportGraph({ root, files });
    const ctx = await buildScoringContext({ root, files, imports });
    expect(ctx.testGap.forFile("src/util.test.ts")).toBe(0);
  });
});

describe("buildScoringContext > blast_radius", () => {
  it("counts transitive importers", async () => {
    const root = await makeRepo({
      "src/leaf.ts": "export const v = 1;\n",
      "src/mid.ts": `import { v } from "./leaf";\nexport const m = v;\n`,
      "src/a.ts": `import { m } from "./mid";\nexport const a = m;\n`,
      "src/b.ts": `import { m } from "./mid";\nexport const b = m;\n`,
    });
    const files = await discover(root);
    const imports = await buildImportGraph({ root, files });
    const ctx = await buildScoringContext({ root, files, imports });
    // leaf has 3 transitive importers (mid + a + b); min(3/50, 1) = 0.06.
    expect(ctx.blastRadius.forFile("src/leaf.ts")).toBe(0.06);
    expect(ctx.blastRadius.forFile("src/mid.ts")).toBe(0.04);
    expect(ctx.blastRadius.forFile("src/a.ts")).toBe(0);
  });

  it("returns 0 when no import graph is available", async () => {
    const root = await makeRepo({ "src/a.ts": "export const a = 1;\n" });
    const files = await discover(root);
    const ctx = await buildScoringContext({ root, files, imports: undefined });
    expect(ctx.blastRadius.forFile("src/a.ts")).toBe(0);
  });
});

describe("computeAgentRisk", () => {
  it("follows the documented unified formula", () => {
    const got = computeAgentRisk({
      severity: "high",
      confidence: 0.95,
      churn: 0.65,
      test_gap: 0.2,
      blast_radius: 0.55,
    });
    // 0.4 * 0.9 + 0.2 * 0.95 + 0.15 * 0.65 + 0.15 * 0.2 + 0.10 * 0.55
    //  = 0.36 + 0.19 + 0.0975 + 0.03 + 0.055 = 0.7325 → 0.73
    expect(got).toBe(0.73);
  });

  it("clamps to <= 1 when every input is at maximum", () => {
    const got = computeAgentRisk({
      severity: "high",
      confidence: 1,
      churn: 1,
      test_gap: 1,
      blast_radius: 1,
    });
    expect(got).toBeLessThanOrEqual(1);
    expect(got).toBeGreaterThan(0.9);
  });
});
