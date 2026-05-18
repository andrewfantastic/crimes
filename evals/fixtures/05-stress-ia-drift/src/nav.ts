// Nav references "Teams", "Workspaces", and "Organisations" — all plural,
// but doesn't include "Billing" at all. Three sources, three different
// naming conventions, three tenant-group aliases for the same concept.
// The /admin entry uses role: "admin"; the route guard at routes/admin.ts
// says owner; the docs prose says manager — permission_ia_drift on /admin.
export const NAV = [
  { href: "/teams", label: "Teams" },
  { href: "/workspaces", label: "Workspaces" },
  { href: "/organisations", label: "Organisations" },
  { href: "/admin", label: "Admin Console", role: "admin" },
];
