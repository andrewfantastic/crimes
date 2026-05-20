import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerScanCommand } from "./scan.js";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
// `packages/cli/src/commands/scan.test.ts` → `packages/cli/dist/index.js`.
// The CLI must have been built (e.g. `pnpm build` or `pnpm ci`) for these
// tests to run — same precondition as `pnpm scan:example`.
const CLI = resolve(here, "..", "..", "dist", "index.js");

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
  return Array.from({ length: 400 }, () => "// line").join("\n");
}

function largeFunctionSource(): string {
  // Past the default 60-line function-body threshold → severity "high".
  const body = Array.from({ length: 200 }, (_, i) => `  const v${i} = ${i};`).join(
    "\n",
  );
  return `export function generateInvoice() {\n${body}\n  return 0;\n}\n`;
}

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
          // Spawn error (binary not found, etc.) — surface as an exception.
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

async function makeChangedRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crimes-cli-fail-on-"));
  await writeFile(join(root, "untouched.ts"), "export const x = 1;\n", "utf8");
  await git(root, "init", "--initial-branch=main", "--quiet");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "init", "--quiet");
  // A new file with a "high" finding (large function past the 60-line threshold).
  await writeFile(join(root, "new.ts"), largeFunctionSource(), "utf8");
  return root;
}

async function makeChangedRepoNoFindings(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crimes-cli-fail-on-ok-"));
  await writeFile(join(root, "seed.ts"), "export const x = 1;\n", "utf8");
  await git(root, "init", "--initial-branch=main", "--quiet");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "init", "--quiet");
  // A trivial new file — no findings.
  await writeFile(join(root, "new.ts"), "export const y = 2;\n", "utf8");
  return root;
}

describe("crimes scan --changed --fail-on", () => {
  it("exits 1 when the changed set contains a finding ≥ threshold", async () => {
    const root = await makeChangedRepo();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "high", "--format", "json", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.fail_on).toBe("high");
    expect(parsed.failed).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
  });

  it("exits 0 when no changed-set finding meets the threshold", async () => {
    const root = await makeChangedRepoNoFindings();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "high", "--format", "json", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.fail_on).toBe("high");
    expect(parsed.failed).toBe(false);
  });

  it("emits an OK / FAILED line in human output when --fail-on is set", async () => {
    const root = await makeChangedRepo();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "high", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAILED:/);
  });

  it("emits an OK line when no findings meet the threshold (human)", async () => {
    const root = await makeChangedRepoNoFindings();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "high", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^OK:/m);
  });

  it("omits fail_on / failed when --fail-on is not provided", async () => {
    const root = await makeChangedRepo();
    const result = await runCli(
      ["scan", "--changed", "--format", "json", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.fail_on).toBeUndefined();
    expect(parsed.failed).toBeUndefined();
  });

  it("rejects --fail-on without --changed (exit 2)", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-cli-fail-on-misuse-"));
    await writeFile(join(root, "a.ts"), bigSource(), "utf8");
    const result = await runCli(["scan", ".", "--fail-on", "high"], root);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--fail-on only applies when --changed/);
  });

  it("rejects unknown --fail-on values (exit 2)", async () => {
    const root = await makeChangedRepo();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "critical"],
      root,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown --fail-on/);
  });

  it("respects --fail-on medium gating high findings", async () => {
    const root = await makeChangedRepo();
    const result = await runCli(
      ["scan", "--changed", "--fail-on", "medium", "--format", "json", "--no-color"],
      root,
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.fail_on).toBe("medium");
    expect(parsed.failed).toBe(true);
  });
});

describe("crimes scan — new flags", () => {
  it("declares --top, --flat, --no-recency", () => {
    const program = new Command();
    registerScanCommand(program);
    const scan = program.commands.find((c) => c.name() === "scan");
    expect(scan).toBeDefined();
    const opts = scan!.options.map((o) => o.long);
    expect(opts).toContain("--top");
    expect(opts).toContain("--flat");
    expect(opts).toContain("--no-recency");
  });
});
