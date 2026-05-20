/**
 * Convert an array of raw values to per-entry quartile scores using the
 * rank-average tiebreak rule. Output preserves input order.
 *
 * For each tied block of identical raw values, every entry in the block
 * gets the same quartile score, computed from the midpoint of the
 * contiguous percentile range the block occupies in the sorted array.
 * This is the standard rank-avg behaviour and avoids the pathology
 * where N tied entries at the worst raw value all get quartile 1.0.
 *
 * Falls back to identity for arrays shorter than 4 — the design spec
 * §5.4 calls this the "small-repo fallback".
 *
 * Snapping rule is documented on the private `snapToQuartile` helper
 * below.
 */
export function quartileScores(raw: number[]): number[] {
  if (raw.length < 4) return raw.slice();

  // Sort with index attached so we can fan results back out in original order.
  const indexed = raw.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const out = new Array<number>(raw.length);
  let i = 0;
  while (i < indexed.length) {
    // Find the contiguous tied block starting at i.
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j += 1;
    // The block occupies indices [i, j) in the sorted array.
    // Midpoint percentile = (i + j) / (2 * length).
    const percentile = (i + j) / (2 * indexed.length);
    const quartile = snapToQuartile(percentile);
    for (let k = i; k < j; k += 1) {
      out[indexed[k]!.i] = quartile;
    }
    i = j;
  }
  return out;
}

/**
 * Snap a midpoint percentile in [0,1] to one of {0, 0.25, 0.5, 0.75, 1}.
 *
 * Not pure nearest-neighbor — uses asymmetric thresholds biased toward the
 * extremes:
 *   [0,      0.25)   → 0
 *   [0.25,   0.4375) → 0.25
 *   [0.4375, 0.5625) → 0.5
 *   [0.5625, 0.75)   → 0.75
 *   [0.75,   1.0]    → 1
 *
 * Calibrated so that:
 *   - The all-tied case (midpoint exactly 0.5) snaps to 0.5, not 1.
 *   - A 3-of-10 tied block at the bottom (midpoint 0.15) snaps to 0.
 *   - A 4-of-10 tied block at the top (midpoint 0.8) snaps to 1.
 *
 * NaN handling: `quartileScores` does not accept NaN inputs (the only
 * caller is `buildScoringContext` with values in {0, 0.5, 1}). Passing
 * NaN would hang the tied-block loop because `NaN === NaN` is false.
 */
function snapToQuartile(percentile: number): number {
  if (percentile < 0.25) return 0;
  if (percentile < 0.4375) return 0.25;
  if (percentile < 0.5625) return 0.5;
  if (percentile < 0.75) return 0.75;
  return 1;
}
