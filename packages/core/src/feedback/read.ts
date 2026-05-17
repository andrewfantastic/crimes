import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { FeedbackEntry } from "./types.js";
import { FeedbackEntrySchema } from "./types.js";

export class MalformedFeedbackEntryError extends Error {
  path: string;
  lineNumber: number;
  constructor(path: string, lineNumber: number, reason: string) {
    super(`feedback entry at ${path}:${lineNumber} is malformed: ${reason}`);
    this.name = "MalformedFeedbackEntryError";
    this.path = path;
    this.lineNumber = lineNumber;
  }
}

export interface ReadFeedbackOptions {
  /**
   * When true, throw {@link MalformedFeedbackEntryError} on a bad line.
   * Defaults to false — bad lines are silently skipped because the
   * file is meant to survive partial writes from prior versions.
   */
  strict?: boolean;
}

export interface ReadFeedbackResult {
  entries: FeedbackEntry[];
  /** True when the file existed and was read. */
  loaded: boolean;
  /** Resolved absolute path of the file (read or not). */
  path: string;
}

export async function readFeedback(
  path: string,
  options: ReadFeedbackOptions = {},
): Promise<ReadFeedbackResult> {
  if (!existsSync(path)) return { entries: [], loaded: false, path };
  const raw = await readFile(path, "utf8");
  const entries: FeedbackEntry[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      if (options.strict) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new MalformedFeedbackEntryError(path, i + 1, `invalid JSON — ${reason}`);
      }
      continue;
    }
    const result = FeedbackEntrySchema.safeParse(parsed);
    if (!result.success) {
      if (options.strict) {
        const first = result.error.issues[0];
        const reason = first
          ? `${first.path.length > 0 ? first.path.join(".") : "(root)"}: ${first.message}`
          : "validation failed";
        throw new MalformedFeedbackEntryError(path, i + 1, reason);
      }
      continue;
    }
    entries.push(result.data);
  }
  return { entries, loaded: true, path };
}

/**
 * Walk the entries (in file order, oldest-first) and return one entry
 * per fingerprint — the latest by timestamp. The append-only file
 * preserves history; this projection answers "what is the current
 * verdict?" without losing the earlier entries.
 */
export function latestPerFingerprint(
  entries: FeedbackEntry[],
): Map<string, FeedbackEntry> {
  const latest = new Map<string, FeedbackEntry>();
  for (const e of entries) {
    const prior = latest.get(e.fingerprint);
    if (!prior || e.timestamp >= prior.timestamp) latest.set(e.fingerprint, e);
  }
  return latest;
}
