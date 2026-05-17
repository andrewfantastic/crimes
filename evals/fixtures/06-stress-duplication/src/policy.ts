// Same `if (role === "admin")` policy check copied across three call sites.
export function canEditBilling(role: string): boolean {
  if (role === "admin") return true;
  return false;
}

export function canSeeAuditLog(role: string): boolean {
  if (role === "admin") return true;
  return false;
}

export function canImpersonate(role: string): boolean {
  if (role === "admin") return true;
  return false;
}
