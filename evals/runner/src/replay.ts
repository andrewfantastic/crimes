#!/usr/bin/env tsx
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreStructural } from "./score.js";
import type { Scenario, ScoreResult } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const RESULTS_DIR = resolve(REPO_ROOT, "evals", "results");
const SCENARIOS_DIR = resolve(REPO_ROOT, "evals", "scenarios");
const REPLAY_DIR = resolve(REPO_ROOT, "evals", "replay");

/**
 * `pnpm run evals:replay` entry. Re-scores every committed result file
 * under the latest `evals/results/<version>/` against the current
 * crimes build (specifically, the current set of detector ids and the
 * file/finding regex shapes in score.ts). No agent invocations.
 *
 * Output lands in `evals/replay/<agent>/<scenario-id>.json` with the
 * same {@link ScoreResult} shape as a fresh run but a new run_id and
 * an updated `crimes_version` reflecting the build under test.
 */
async function main(): Promise<void> {
  const latest = pickLatestVersion();
  if (!latest) {
    process.stdout.write(
      "evals:replay: no pinned results under evals/results/ yet — nothing to replay.\n",
    );
    return;
  }
  process.stdout.write(
    `evals:replay: replaying results pinned at ${latest.version} against the current build.\n`,
  );

  const scenarios = loadScenarios();
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  const versionDir = resolve(RESULTS_DIR, latest.version);
  const replayCrimesVersion = await readCrimesVersion();

  let count = 0;
  for (const agentEntry of readdirSync(versionDir, { withFileTypes: true })) {
    // summary.json (and any future top-level files) live next to the
    // agent directories — skip non-directories so we don't try to walk
    // them as if they held per-scenario results.
    if (!agentEntry.isDirectory()) continue;
    const agentName = agentEntry.name;
    const agentDir = resolve(versionDir, agentName);
    const stat = readdirSync(agentDir, { withFileTypes: true });
    for (const entry of stat) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = resolve(agentDir, entry.name);
      const stored = JSON.parse(readFileSync(filePath, "utf8")) as ScoreResult;
      const scenario = scenarioById.get(stored.scenario);
      if (!scenario) {
        process.stderr.write(
          `evals:replay: ${entry.name} references unknown scenario ${stored.scenario} — skipping.\n`,
        );
        continue;
      }
      const structural = scoreStructural(
        stored.response,
        scenario.expected_artifacts,
      );
      const replayed: ScoreResult = {
        scenario: stored.scenario,
        agent: stored.agent,
        crimes_version: replayCrimesVersion,
        timestamp: new Date().toISOString(),
        run_id: stored.run_id,
        response: stored.response,
        structural_score: structural,
      };
      if (stored.judge_score) replayed.judge_score = stored.judge_score;

      const outDir = resolve(REPLAY_DIR, agentName);
      mkdirSync(outDir, { recursive: true });
      await writeFile(
        resolve(outDir, entry.name),
        JSON.stringify(replayed, null, 2) + "\n",
        "utf8",
      );
      count += 1;
    }
  }

  process.stdout.write(
    `evals:replay: ${count} result file${count === 1 ? "" : "s"} re-scored → ${REPLAY_DIR}\n`,
  );
}

function pickLatestVersion(): { version: string } | undefined {
  if (!existsSync(RESULTS_DIR)) return undefined;
  const versions = readdirSync(RESULTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^\d+\.\d+\.\d+/.test(name))
    .sort(compareSemverDesc);
  const top = versions[0];
  return top ? { version: top } : undefined;
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10));
  const pb = b.split(".").map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

function loadScenarios(): Scenario[] {
  if (!existsSync(SCENARIOS_DIR)) return [];
  const out: Scenario[] = [];
  for (const file of readdirSync(SCENARIOS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(
        readFileSync(resolve(SCENARIOS_DIR, file), "utf8"),
      ) as Scenario[];
      if (Array.isArray(data)) out.push(...data);
    } catch {
      // surfaced by the runner already; ignore here
    }
  }
  return out;
}

async function readCrimesVersion(): Promise<string> {
  const pkgPath = resolve(REPO_ROOT, "packages", "cli", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`evals:replay: ${message}\n`);
  process.exit(1);
});

// Required so the helper compiles standalone when `join` isn't used in
// the main path (tsc strict unused-import is paranoid about this).
void join;
