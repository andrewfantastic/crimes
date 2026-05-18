import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@crimes/core";

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

describe("crimes init", () => {
  it("writes crimes.config.json when none exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    const result = await runCli(["init"], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Wrote crimes.config.json");
    expect(existsSync(join(root, "crimes.config.json"))).toBe(true);
  });

  it("refuses to overwrite without --force (exit 2)", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    writeFileSync(join(root, "crimes.config.json"), `{ "include": ["custom"] }`);

    const result = await runCli(["init"], root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("already exists");
    // File contents unchanged.
    const raw = readFileSync(join(root, "crimes.config.json"), "utf8");
    expect(raw).toBe(`{ "include": ["custom"] }`);
  });

  it("--force overwrites the existing file", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    writeFileSync(join(root, "crimes.config.json"), `{ "include": ["custom"] }`);

    const result = await runCli(["init", "--force"], root);

    expect(result.exitCode).toBe(0);
    const raw = readFileSync(join(root, "crimes.config.json"), "utf8");
    expect(raw).toContain("$schema");
  });

  it("written file passes loadConfig validation (round-trip)", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    const result = await runCli(["init"], root);
    expect(result.exitCode).toBe(0);

    // Should not throw.
    const config = loadConfig(root);
    expect(config.include?.[0]).toContain("ts");
  });

  it("--agent-skill writes a Claude Code skill file", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    const result = await runCli(["init", "--agent-skill"], root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude/skills/crimes/SKILL.md");
    const skillPath = join(root, ".claude", "skills", "crimes", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    const raw = readFileSync(skillPath, "utf8");
    expect(raw).toContain("crimes context <file> --format json");
    expect(raw).toContain("severity: \"high\"");
  });

  it("--agent-skill refuses to overwrite an existing skill without --force", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    const skillPath = join(root, ".claude", "skills", "crimes", "SKILL.md");
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, "custom skill", { encoding: "utf8", flag: "w" });

    const result = await runCli(["init", "--agent-skill"], root);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("already exists");
    expect(readFileSync(skillPath, "utf8")).toBe("custom skill");
  });

  it("--agent-skill --force overwrites an existing skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "crimes-init-"));
    const skillPath = join(root, ".claude", "skills", "crimes", "SKILL.md");
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(join(root, "crimes.config.json"), `{ "include": ["custom"] }`);
    writeFileSync(skillPath, "custom skill", { encoding: "utf8", flag: "w" });

    const result = await runCli(["init", "--agent-skill", "--force"], root);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(skillPath, "utf8")).toContain("codebase risk workflow");
  });
});
