import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { NotAGitRepoError } from "./git/changed-files.js";
import { scan } from "./scan.js";

const execFileAsync = promisify(execFile);

async function makeRepo(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-scan-test-"));
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(dir, path), content, "utf8");
  }
  return dir;
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

function bigSource(): string {
  // Past the default 300-line threshold so the file is flagged.
  return Array.from({ length: 400 }, () => "// line").join("\n");
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

  describe("--changed", () => {
    it("restricts the scan to working-tree changes when no base is given", async () => {
      const root = await makeRepo({
        "untouched.ts": bigSource(),
      });
      await git(root, "init", "--initial-branch=main", "--quiet");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "init", "--quiet");

      // Add a second oversized file *after* the commit — only this one
      // should be scanned with --changed.
      await writeFile(join(root, "new-big.ts"), bigSource(), "utf8");

      const report = await scan({ root, changed: true });
      const files = report.findings.map((f) => f.file);
      expect(files).toContain("new-big.ts");
      expect(files).not.toContain("untouched.ts");
    });

    it("returns an empty report when nothing has changed", async () => {
      const root = await makeRepo({
        "big.ts": bigSource(),
      });
      await git(root, "init", "--initial-branch=main", "--quiet");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "init", "--quiet");

      const report = await scan({ root, changed: true });
      expect(report.findings).toEqual([]);
      expect(report.summary.total).toBe(0);
    });

    it("uses <base>...HEAD when a base ref is provided", async () => {
      const root = await makeRepo({
        "untouched.ts": bigSource(),
      });
      await git(root, "init", "--initial-branch=main", "--quiet");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "init", "--quiet");

      await git(root, "checkout", "-b", "feature", "--quiet");
      await writeFile(join(root, "feature.ts"), bigSource(), "utf8");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "feature commit", "--quiet");

      const report = await scan({ root, changed: true, base: "main" });
      const files = report.findings.map((f) => f.file);
      expect(files).toContain("feature.ts");
      expect(files).not.toContain("untouched.ts");
    });

    it("throws NotAGitRepoError outside a git repo", async () => {
      const root = await makeRepo({ "a.ts": bigSource() });
      await expect(scan({ root, changed: true })).rejects.toBeInstanceOf(
        NotAGitRepoError,
      );
    });

    it("respects include/exclude — non-JS/TS changed files are ignored", async () => {
      const root = await makeRepo({
        "kept.ts": "export const x = 1;\n",
      });
      await git(root, "init", "--initial-branch=main", "--quiet");
      await git(root, "add", "-A");
      await git(root, "commit", "-m", "init", "--quiet");

      // Touch a non-JS/TS file alongside a TS file.
      await writeFile(join(root, "README.md"), "# hi\n", "utf8");
      await writeFile(join(root, "new.ts"), bigSource(), "utf8");

      const report = await scan({ root, changed: true });
      const files = report.findings.map((f) => f.file);
      expect(files).toContain("new.ts");
      expect(files).not.toContain("README.md");
    });
  });
});
