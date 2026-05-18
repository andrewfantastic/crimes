// Intentionally bad: sync I/O inside what is conceptually a request
// handler, plus a developer-specific local path and a dev-server URL
// hardcoded into source. All three of these survive code review more
// often than they should.

import { existsSync, readFileSync, statSync } from "node:fs";

const ADMIN_DASHBOARD = "http://localhost:3000/admin";
const SCHEMA_PATH = "/Users/andrew/dev/crimes/schema.json";

export function loadPlanSchema(): unknown {
  if (!existsSync(SCHEMA_PATH)) return null;
  const stat = statSync(SCHEMA_PATH);
  if (stat.size === 0) return null;
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
}

export function adminUrl(): string {
  return ADMIN_DASHBOARD;
}
