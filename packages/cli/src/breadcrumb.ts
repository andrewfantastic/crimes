import type { CrimesConfig } from "@crimes/core";

/**
 * Number of disabled detectors at or above which the breadcrumb fires.
 * Per `DETECTOR_SCORING_COMPLETION_PLAN.md` §12: "Suppressed when
 * `detectors.disable.length < 3`."
 */
const DISABLED_DETECTORS_THRESHOLD = 3;

export interface BreadcrumbOptions {
  /**
   * When true, decorative diagnostics are suppressed. Callers should
   * pass the same effective no-color flag they pass to the human
   * reporter — i.e. `--no-color` OR `!process.stdout.isTTY`. The
   * breadcrumb is a diagnostic for interactive humans; piping
   * `crimes scan --format json` shouldn't smear stderr into the
   * agent's pipeline.
   */
  noColor?: boolean;
  /** Override the stderr sink. Tests pass a buffer; CLI uses `process.stderr`. */
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

/**
 * Read the effective "no-color" flag from a Commander options bag.
 * Commander assigns `--no-color` to `options.color = false`, so a raw
 * `options.noColor` (the historical name in this codebase) is always
 * undefined. Falls back to `!process.stdout.isTTY` so piped output
 * stays quiet by default — same convention the human reporter uses.
 */
export function resolveNoColor(options: {
  color?: boolean;
  noColor?: boolean;
}): boolean {
  if (options.color === false) return true;
  if (options.noColor === true) return true;
  return !process.stdout.isTTY;
}

/**
 * Emit the one-line `detectors.disable` breadcrumb to stderr when a
 * `crimes.config.json` has wholesale-disabled a meaningful chunk of
 * the built-in detector set. Idempotent at the call site (each command
 * invokes it once), no-ops otherwise.
 *
 *   crimes: detectors.disable removed 5 detectors from this run.
 *           Consider per-finding `crimes ignore` for narrow exceptions.
 *
 * Suppression rules (per §12):
 *   • `detectors.disable.length < 3` — nothing to flag.
 *   • `options.noColor` — caller asked for clean diagnostics.
 */
export function emitDetectorsDisabledBreadcrumb(
  config: CrimesConfig,
  options: BreadcrumbOptions = {},
): void {
  if (options.noColor) return;
  const disabled = config.detectors?.disable ?? [];
  if (disabled.length < DISABLED_DETECTORS_THRESHOLD) return;
  const stderr = options.stderr ?? process.stderr;
  stderr.write(
    `crimes: detectors.disable removed ${disabled.length} detectors from this run.\n` +
      `        Consider per-finding \`crimes ignore\` for narrow exceptions.\n`,
  );
}
