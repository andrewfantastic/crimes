// Intentional violations — one per proposed detector.
// Used to confirm the prototype detects what it claims to.
// This file is NOT real code; it is calibration material.

// 1. timezone_unsafe_parse — string with no Z/offset
export function parseBirthday(): Date {
  return new Date("2024-03-15T09:00:00");
}

// 2. mixed_utc_local_methods — same `d` uses both UTC and local
export function dateLabel(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 3. locale_drift — no locale arg
export function prettyDate(d: Date): string {
  return d.toLocaleDateString();
}

// 4. dst_naive_arithmetic — 86400000ms = 1 day
export function tomorrowMs(now: number): number {
  return now + 86400000;
}

// 5. date_string_concat — string-building dates by hand
export function legacyStamp(d: Date): string {
  return d.getUTCFullYear() + "-" + d.getUTCMonth();
}

// 6. date_equality_misuse — comparing Date objects with ===
export function sameInstant(a: Date, b: Date): boolean {
  return a === b;
}

// Negatives — should NOT fire:
//   - `new Date(123456789)` (numeric arg, no parse)
//   - `new Date("2024-03-15T09:00:00Z")` (has Z)
//   - `d.toLocaleDateString("en-GB")` (locale provided)
//   - `now + 1000` (arbitrary number, not a day constant)
export function negativeControls(now: number, d: Date): unknown {
  return [
    new Date(123456789),
    new Date("2024-03-15T09:00:00Z"),
    d.toLocaleDateString("en-GB"),
    now + 1000,
  ];
}
