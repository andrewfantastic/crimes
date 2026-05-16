import type { Finding } from "./finding.js";

/**
 * Stable, cross-scan identity for a {@link Finding}.
 *
 * Two scans run at different commits should agree on the fingerprint of "the
 * same finding" even when unrelated edits have shifted line numbers. That
 * means the fingerprint deliberately does **not** include:
 *
 * - `id` (re-assigned per scan based on sort order)
 * - `lines` (small unrelated edits shift them)
 * - `summary`, `evidence`, `scores` (derived; may drift across detector tuning)
 *
 * The fingerprint is `<type>::<file>::<symbol-or-empty>`:
 *
 * - `type` — detector identity (`large_function`, `large_file`, ...)
 * - `file` — repo-relative POSIX path. File renames register as a fix+new
 *   pair, mirroring how `git diff` treats renames without `--find-renames`.
 * - `symbol` — present for findings that name a specific declaration (e.g.
 *   `large_function.symbol = "generateInvoice"`); empty for file-level
 *   detectors (`large_file`, `todo_density`, `direct_date`) where the
 *   `(type, file)` pair is already unique.
 *
 * Known limitation: two findings with the same `type`, `file`, and `symbol`
 * in one scan (e.g. nested helpers or overloaded function declarations with
 * identical names) collide on a single fingerprint. The diff will treat them
 * as one logical finding. This is rare in practice; if it becomes a problem,
 * a future schema version can add a disambiguator.
 */
export function fingerprintFinding(finding: Finding): string {
  return `${finding.type}::${finding.file}::${finding.symbol ?? ""}`;
}
