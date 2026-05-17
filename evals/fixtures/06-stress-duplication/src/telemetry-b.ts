// Exact-duplicate of telemetry-a.ts — exact_duplicate_block should fire.
// Lives in its own file (not in sanitize-*.ts) so the file sets of the
// near-duplicate and exact-duplicate groups don't overlap, which would
// otherwise trigger the near_duplicate_block detector's anti-double-report
// suppression at packages/core/src/detectors/near-duplicate-block.ts.
export function recordSanitiseEvent(
  originalLength: number,
  sanitisedLength: number,
): void {
  const eventType = "sanitise.complete";
  const reductionRatio = sanitisedLength / Math.max(1, originalLength);
  const payload = {
    originalLength,
    sanitisedLength,
    reductionRatio,
    timestamp: Date.now(),
  };
  console.log(JSON.stringify({ type: eventType, payload, source: "sanitiser" }));
}
