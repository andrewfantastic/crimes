import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sentinel header for parsing `git log` output. We emit one of these before
 * every commit so we can split the stream unambiguously — file paths in a
 * repo will never start with this string.
 */
const COMMIT_MARKER = "CRIMES_COMMIT";

export interface FileChurn {
  /** Repo-relative path with forward slashes (as Git emits it). */
  file: string;
  /** Number of commits in the window that touched this file. */
  changeCount: number;
  /** ISO-8601 timestamp of the most recent commit that touched the file. */
  latestChange: string;
}

export interface CollectChurnOptions {
  /** Repo root. */
  root: string;
  /**
   * Window for `git log --since`. Examples accepted by Git:
   *   "90 days ago", "2 weeks ago", "2026-01-01". This module also accepts
   *   compact forms via {@link normaliseSince} — `"90d"`, `"2w"`, `"1y"`.
   */
  since: string;
}

export interface CollectChurnResult {
  /** Whether the directory is a git repository and `git` is invokable. */
  gitAvailable: boolean;
  /**
   * One entry per file touched in the window. Empty when `gitAvailable` is
   * false or the window contains no commits.
   */
  files: FileChurn[];
}

/**
 * Convert compact since-strings ("90d", "2w", "6m", "1y") to a phrase Git
 * understands. Anything that doesn't match the compact pattern is returned
 * as-is so Git's own parser handles dates / phrases.
 */
export function normaliseSince(since: string): string {
  const compact = /^\s*(\d+)\s*([dwmy])\s*$/i.exec(since);
  if (!compact) return since;

  const value = Number(compact[1]);
  const unit = compact[2]!.toLowerCase();
  switch (unit) {
    case "d":
      return `${value} days ago`;
    case "w":
      return `${value} weeks ago`;
    case "m":
      return `${value} months ago`;
    case "y":
      return `${value} years ago`;
    default:
      return since;
  }
}

/**
 * Parse the output of `git log --pretty=format:CRIMES_COMMIT %cI --name-only`.
 *
 * Output shape (one commit shown):
 *
 *   CRIMES_COMMIT 2026-05-15T14:30:00+00:00
 *   path/to/file-a.ts
 *   path/to/file-b.ts
 *
 *   CRIMES_COMMIT 2026-05-14T...
 *   path/to/file-c.ts
 *
 * Each blank line ends a commit block. Merge commits (no file changes) are
 * tolerated and ignored.
 */
export function parseGitLog(output: string): FileChurn[] {
  const byFile = new Map<string, { count: number; latest: string }>();
  let currentDate: string | null = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.length === 0) {
      currentDate = null;
      continue;
    }
    if (line.startsWith(COMMIT_MARKER)) {
      currentDate = line.slice(COMMIT_MARKER.length).trim();
      continue;
    }
    if (currentDate === null) continue;

    const file = line.trim();
    if (file.length === 0) continue;

    const existing = byFile.get(file);
    if (existing) {
      existing.count += 1;
      if (existing.latest < currentDate) existing.latest = currentDate;
    } else {
      byFile.set(file, { count: 1, latest: currentDate });
    }
  }

  const result: FileChurn[] = [];
  for (const [file, { count, latest }] of byFile) {
    result.push({ file, changeCount: count, latestChange: latest });
  }
  result.sort((a, b) => {
    if (b.changeCount !== a.changeCount) return b.changeCount - a.changeCount;
    return a.file.localeCompare(b.file);
  });
  return result;
}

/**
 * Return true if `root` looks like a Git working tree. Cheap — just a file
 * existence check. Doesn't shell out to `git`.
 */
export function isGitRepo(root: string): boolean {
  return existsSync(resolve(root, ".git"));
}

interface SpawnResult {
  status: number | null;
  stdout: string;
}

function runGit(root: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolvePromise, reject) => {
    // `spawn` with an args array does not invoke a shell, so the `since`
    // string can't be interpreted as a command.
    const child = spawn("git", args, { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) {
        resolvePromise({ status, stdout });
      } else {
        reject(new Error(`git ${args.join(" ")} exited ${status}: ${stderr}`));
      }
    });
  });
}

/**
 * Run `git log` over the window and return per-file churn. Resolves with
 * `gitAvailable: false` (and an empty file list) for non-git directories or
 * when the `git` binary is missing.
 */
export async function collectChurn(
  options: CollectChurnOptions,
): Promise<CollectChurnResult> {
  const { root, since } = options;
  if (!isGitRepo(root)) {
    return { gitAvailable: false, files: [] };
  }

  const sinceArg = normaliseSince(since);

  try {
    const result = await runGit(root, [
      "log",
      `--since=${sinceArg}`,
      `--pretty=format:${COMMIT_MARKER} %cI`,
      "--name-only",
      "--no-merges",
    ]);
    return { gitAvailable: true, files: parseGitLog(result.stdout) };
  } catch {
    return { gitAvailable: false, files: [] };
  }
}
