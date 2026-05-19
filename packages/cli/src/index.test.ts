import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "..", "dist", "index.js");
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf8"),
).version as string;

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "number") {
          resolvePromise({ stdout, stderr, exitCode: error.code });
          return;
        }
        resolvePromise({ stdout, stderr, exitCode: 0 });
      },
    );
  });
}

describe("bare `crimes` invocation", () => {
  it("prints the welcome banner with version, three commands, and docs link", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`crimes ${PKG_VERSION}`);
    expect(result.stdout).toContain("crimes init --agents");
    expect(result.stdout).toContain("crimes init  ");
    expect(result.stdout).toContain("crimes --help");
    expect(result.stdout).toContain("https://crimes.sh");
  });

  it("--help still renders Commander's usage output", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: crimes");
    expect(result.stdout).toContain("Commands:");
  });

  it("--version prints only the version", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(PKG_VERSION);
  });
});
