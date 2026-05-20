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

/** Snap a percentile in [0,1] to the nearest 0.25 bucket. */
function snapToQuartile(percentile: number): number {
  if (percentile < 0.25) return 0;
  if (percentile < 0.4375) return 0.25;
  if (percentile < 0.5625) return 0.5;
  if (percentile < 0.75) return 0.75;
  return 1;
}
