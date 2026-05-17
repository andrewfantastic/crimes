import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Per-repo feedback JSONL. Lives next to `.crimes/baseline.json` and
 * `.crimes/suppressions.json` so the file gets committed and reviewed
 * alongside the rest of the calibration artefacts.
 */
export const FEEDBACK_RELATIVE_PATH = ".crimes/feedback.jsonl" as const;

/** Per-machine cross-project rollup. Not intended to be committed anywhere. */
export const FEEDBACK_GLOBAL_RELATIVE_PATH =
  ".crimes/feedback-rollup.jsonl" as const;

export function resolveFeedbackPath(root: string): string {
  return resolve(root, FEEDBACK_RELATIVE_PATH);
}

export interface ResolveGlobalRollupPathOptions {
  /** Override the home directory. Useful for tests. */
  home?: string;
}

export function resolveGlobalRollupPath(
  options: ResolveGlobalRollupPathOptions = {},
): string {
  const home = options.home ?? homedir();
  return resolve(home, FEEDBACK_GLOBAL_RELATIVE_PATH);
}
