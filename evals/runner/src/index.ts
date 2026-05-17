#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FixturesRegistry, Scenario } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const FIXTURES_REGISTRY = resolve(
  REPO_ROOT,
  "evals",
  "fixtures",
  "fixtures.meta.json",
);
const SCENARIOS_DIR = resolve(REPO_ROOT, "evals", "scenarios");

/**
 * `pnpm run evals` entry. Reads the fixtures registry and scenario
 * library, prints what *would* run, and exits 0 when no scenarios are
 * configured. The actual agent invocation + scoring lands in Prompts K
 * and L; this is the Prompt I scaffold so the wire is in place.
 */
function main(): void {
  if (!existsSync(FIXTURES_REGISTRY)) {
    process.stdout.write(
      `evals: ${FIXTURES_REGISTRY} not found — run \`pnpm run evals:setup\` first.\n`,
    );
    return;
  }

  const registry = JSON.parse(
    readFileSync(FIXTURES_REGISTRY, "utf8"),
  ) as FixturesRegistry;

  const scenarios = loadScenarios();

  if (registry.fixtures.length === 0) {
    process.stdout.write(
      "evals: no fixtures registered. Add entries to evals/fixtures/fixtures.meta.json (Prompt J).\n",
    );
    return;
  }
  if (scenarios.length === 0) {
    process.stdout.write(
      "evals: no scenarios configured. Add scenarios to evals/scenarios/*.json (Prompt J).\n",
    );
    return;
  }

  process.stdout.write(
    `evals: ${registry.fixtures.length} fixture${registry.fixtures.length === 1 ? "" : "s"}, ` +
      `${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} discovered.\n` +
      "(agent invocation + scoring land in Prompt K — this is the scaffold pass.)\n",
  );
}

function loadScenarios(): Scenario[] {
  if (!existsSync(SCENARIOS_DIR)) return [];
  const out: Scenario[] = [];
  for (const file of readdirSync(SCENARIOS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(resolve(SCENARIOS_DIR, file), "utf8");
      const data = JSON.parse(raw) as Scenario[];
      if (Array.isArray(data)) out.push(...data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `evals: failed to parse ${file} — ${message}\n`,
      );
    }
  }
  return out;
}

main();
