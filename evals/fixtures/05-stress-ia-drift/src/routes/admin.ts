// Route guard for /admin. The required-role literal here disagrees with
// the nav entry attribute ("admin") and the docs prose ("manager") — three
// different role tokens for one destination, which is permission_ia_drift.
export const requiredRole = "owner";

export function loadAdminPanel() {
  // Older code path still falls back to the manager role — a stale check
  // that nobody updated when the route flipped to owner-only.
  if (currentUser.role === "manager") return { ok: true, legacy: true };
  if (currentUser.role !== "owner") return null;
  return { ok: true };
}

declare const currentUser: { role: string };
