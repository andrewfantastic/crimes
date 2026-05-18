import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { systemClock } from "../clock.js";
import type { FeedbackEntry } from "./types.js";

export interface WriteFeedbackOptions {
  /** Override the timestamp source for tests. */
  now?: () => Date;
}

export interface WriteFeedbackResult {
  /** The entry that was appended, including the assigned timestamp. */
  entry: FeedbackEntry;
  /** Absolute path of the JSONL file written to. */
  path: string;
}

/**
 * Append one entry to a JSONL feedback file. Creates the parent
 * directory if needed. Never modifies existing lines — re-feedback on
 * the same fingerprint appends a new line; read paths walk backwards
 * for the current verdict.
 */
export async function writeFeedbackEntry(
  path: string,
  entry: Omit<FeedbackEntry, "timestamp">,
  options: WriteFeedbackOptions = {},
): Promise<WriteFeedbackResult> {
  const now = options.now ?? systemClock;
  const timestamp = now().toISOString();
  const full: FeedbackEntry = { timestamp, ...entry };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(full) + "\n", "utf8");
  return { entry: full, path };
}
