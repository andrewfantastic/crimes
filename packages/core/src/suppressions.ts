import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { CrimesConfig } from "./config.js";
import { resolveSuppressionsPath } from "./config.js";
import { fingerprintFinding } from "./fingerprint.js";
import type { Finding } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";

/**
 * One per-finding exception, keyed by stable fingerprint. The denormalised
 * `type` / `file` / `symbol` fields exist so a reviewer scanning
 * `git diff .crimes/suppressions.json` can read the entry without parsing
 * the fingerprint — they are strictly redundant for matching.
 */
export interface SuppressionEntry {
  fingerprint: string;
  type: string;
  file?: string;
  symbol?: string;
  reason: string;
  created_at: string;
  created_by?: string;
}

/**
 * On-disk suppressions document. Shipped as `.crimes/suppressions.json`
 * by default; the file is intended to be committed and hand-reviewable.
 */
export interface Suppressions {
  schema_version: typeof SCHEMA_VERSION;
  report_type: "suppressions";
  created_at: string;
  updated_at: string;
  crimes_version?: string;
  suppressions: SuppressionEntry[];
}

export const SuppressionEntrySchema = z
  .object({
    fingerprint: z.string().min(1),
    type: z.string().min(1),
    file: z.string().min(1).optional(),
    symbol: z.string().min(1).optional(),
    reason: z.string().min(1),
    created_at: z.string().min(1),
    created_by: z.string().min(1).optional(),
  })
  .strict();

export const SuppressionsSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    report_type: z.literal("suppressions"),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    crimes_version: z.string().min(1).optional(),
    suppressions: z.array(SuppressionEntrySchema),
  })
  .strict();

export class MalformedSuppressionsError extends Error {
  path: string;
  constructor(path: string, reason: string) {
    super(`suppressions at ${path} are malformed: ${reason}`);
    this.name = "MalformedSuppressionsError";
    this.path = path;
  }
}

export interface LoadSuppressionsResult {
  /** Empty when the file does not exist. */
  entries: SuppressionEntry[];
  /** Resolved absolute path of the file (read or not). */
  path: string;
  /** True when the file existed and was read. */
  loaded: boolean;
}

/**
 * Read `.crimes/suppressions.json` (or the configured path) and return its
 * entries. A missing file is not an error — the function returns an empty
 * list. A present-but-malformed file throws {@link MalformedSuppressionsError}.
 */
export function loadSuppressions(path: string): LoadSuppressionsResult {
  if (!existsSync(path)) return { entries: [], path, loaded: false };

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MalformedSuppressionsError(
      path,
      `unable to read file — ${message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MalformedSuppressionsError(path, `invalid JSON — ${message}`);
  }

  const result = SuppressionsSchema.safeParse(parsed);
  if (!result.success) {
    throw new MalformedSuppressionsError(
      path,
      formatZodIssues(result.error.issues),
    );
  }

  return { entries: result.data.suppressions, path, loaded: true };
}

function formatZodIssues(issues: z.core.$ZodIssue[]): string {
  const first = issues[0];
  if (!first) return "validation failed";
  const path = first.path.length > 0 ? first.path.join(".") : "(root)";
  return `${path}: ${first.message}`;
}

export interface AppendSuppressionOptions {
  /** Override the timestamp source for tests. */
  now?: () => Date;
  /** Crimes version string, recorded on every write. */
  crimesVersion?: string;
}

export interface AppendSuppressionResult {
  /** Final document written to disk. */
  document: Suppressions;
  /** Absolute path the file was written to. */
  path: string;
  /** True when the entry already existed (its reason / updated_at were updated). */
  updated: boolean;
}

/**
 * Append or update a suppression entry, writing the file back out
 * pretty-printed (2-space indent + trailing newline) so the diff is
 * reviewable.
 *
 * - A new fingerprint appends.
 * - An existing fingerprint updates `reason` and the document's top-level
 *   `updated_at`. The entry's `created_at` is preserved.
 */
export async function appendSuppression(
  path: string,
  entry: Omit<SuppressionEntry, "created_at">,
  options: AppendSuppressionOptions = {},
): Promise<AppendSuppressionResult> {
  const now = (options.now ?? (() => new Date()))();
  const iso = now.toISOString();

  let doc: Suppressions;
  let existed = false;
  if (existsSync(path)) {
    const loaded = loadSuppressions(path);
    doc = {
      schema_version: SCHEMA_VERSION,
      report_type: "suppressions",
      // Preserve created_at from disk; only update updated_at.
      created_at: readCreatedAt(path) ?? iso,
      updated_at: iso,
      suppressions: loaded.entries,
    };
    if (options.crimesVersion) doc.crimes_version = options.crimesVersion;
  } else {
    doc = {
      schema_version: SCHEMA_VERSION,
      report_type: "suppressions",
      created_at: iso,
      updated_at: iso,
      suppressions: [],
    };
    if (options.crimesVersion) doc.crimes_version = options.crimesVersion;
  }

  const existingIdx = doc.suppressions.findIndex(
    (s) => s.fingerprint === entry.fingerprint,
  );
  if (existingIdx >= 0) {
    existed = true;
    const prior = doc.suppressions[existingIdx]!;
    const next: SuppressionEntry = {
      ...prior,
      reason: entry.reason,
    };
    if (entry.type) next.type = entry.type;
    if (entry.file !== undefined) next.file = entry.file;
    if (entry.symbol !== undefined) next.symbol = entry.symbol;
    if (entry.created_by !== undefined) next.created_by = entry.created_by;
    doc.suppressions[existingIdx] = next;
  } else {
    const next: SuppressionEntry = {
      fingerprint: entry.fingerprint,
      type: entry.type,
      reason: entry.reason,
      created_at: iso,
    };
    if (entry.file !== undefined) next.file = entry.file;
    if (entry.symbol !== undefined) next.symbol = entry.symbol;
    if (entry.created_by !== undefined) next.created_by = entry.created_by;
    doc.suppressions.push(next);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(doc, null, 2) + "\n", "utf8");

  return { document: doc, path, updated: existed };
}

function readCreatedAt(path: string): string | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { created_at?: unknown }).created_at === "string"
    ) {
      return (parsed as { created_at: string }).created_at;
    }
  } catch {
    // fall through
  }
  return undefined;
}

export interface ApplySuppressionsOptions {
  showSuppressed: boolean;
}

export interface PartitionedFindings {
  visible: Finding[];
  suppressedCount: number;
}

/**
 * Split a finding list into a visible set + matched count.
 *
 * - With `showSuppressed: false`, matched findings are removed entirely.
 * - With `showSuppressed: true`, matched findings stay in `visible`,
 *   annotated with `suppressed: true` and `suppression_reason`.
 *
 * Pure / synchronous — the engines call this after building their raw
 * findings list and use the result to assemble the final report.
 */
export function partitionFindings(
  findings: Finding[],
  suppressions: SuppressionEntry[],
  options: ApplySuppressionsOptions,
): PartitionedFindings {
  if (suppressions.length === 0) {
    return { visible: findings, suppressedCount: 0 };
  }
  const byPrint = new Map<string, SuppressionEntry>();
  for (const s of suppressions) byPrint.set(s.fingerprint, s);

  let suppressedCount = 0;
  const visible: Finding[] = [];
  for (const f of findings) {
    const entry = byPrint.get(fingerprintFinding(f));
    if (entry) {
      suppressedCount += 1;
      if (options.showSuppressed) {
        visible.push({
          ...f,
          suppressed: true,
          suppression_reason: entry.reason,
        });
      }
      continue;
    }
    visible.push(f);
  }
  return { visible, suppressedCount };
}

/**
 * Resolve and load suppressions for a given root + config. Returns an
 * empty list when the file is absent. Throws {@link MalformedSuppressionsError}
 * on a present-but-invalid file.
 */
export function loadSuppressionsForRoot(
  root: string,
  config: CrimesConfig,
): LoadSuppressionsResult {
  const path = resolveSuppressionsPath(root, config);
  return loadSuppressions(path);
}

/**
 * Resolve a file path against a repo root. Mirrors
 * {@link resolveSuppressionsPath}'s rule for `--file` overrides: absolute
 * paths win, relative paths resolve against the root.
 */
export function resolveOverridePath(root: string, override: string): string {
  return isAbsolute(override) ? override : resolve(root, override);
}
