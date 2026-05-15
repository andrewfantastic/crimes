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
