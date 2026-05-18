// Intentionally bad temporal handling.

export function isExpired(timestampMs: number): boolean {
  return Date.now() > timestampMs;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function ageMs(createdAt: number): number {
  return Date.now() - createdAt;
}

// Intentionally bad: parses a date-only string (UTC midnight) plus a
// datetime without a zone (local time). Both interpretations surprise
// the reader and depend on the runtime's timezone.
export function christmasMorning(): Date {
  return new Date("2026-12-25T07:00:00");
}

export function startOfPromoWindow(): Date {
  return new Date("2026-12-20");
}

// Intentionally bad: mixes UTC reads with local reads on the same `d`,
// and builds the label with string concatenation that drops the
// zero-padding and zero-index correction (months are 0-indexed).
export function dateLabel(): string {
  const d = new Date();
  return d.getUTCFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}

// Intentionally bad: host-locale-dependent rendering.
export function prettyDueDate(due: Date): string {
  return due.toLocaleDateString();
}

// Intentionally bad: "+ 1 day" using a raw ms constant. Wrong on DST
// transitions.
export function tomorrowMs(nowMs: number): number {
  return nowMs + 86400000;
}
