#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeFile, rename, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { invokeClaude } from "./agents/claude.js";
import { invokeCodex } from "./agents/codex.js";
import type { AgentRunResult } from "./agents/claude.js";
import { scoreStructural } from "./score.js";
import type {
  FixtureRegistryEntry,
  FixturesRegistry,
  Scenario,
  ScenarioKind,
  ScoreResult,
} from "./types.js";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const FIXTURES_REGISTRY = resolve(
  REPO_ROOT,
  "evals",
  "fixtures",
  "fixtures.meta.json",
);
const SCENARIOS_DIR = resolve(REPO_ROOT, "evals", "scenarios");
const RESULTS_DIR = resolve(REPO_ROOT, "evals", "results");
const CLI_DIST = resolve(REPO_ROOT, "packages", "cli", "dist", "index.js");

const AGENTS = ["claude", "codex"] as const;
type Agent = (typeof AGENTS)[number];

interface CliFlags {
  agent?: Agent;
  fixture?: string;
  scenario?: ScenarioKind;
  judge: boolean;
  bail: boolean;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (!existsSync(FIXTURES_REGISTRY)) {
    process.stdout.write(
      `evals: ${FIXTURES_REGISTRY} not found — run \`pnpm run evals:setup\` first.\n`,
    );
    return;
  }
  const registry = JSON.parse(
    readFileSync(FIXTURES_REGISTRY, "utf8"),
  ) as FixturesRegistry;
  const allScenarios = loadScenarios();

  if (registry.fixtures.length === 0 || allScenarios.length === 0) {
    process.stdout.write(
      "evals: nothing to run (registry or scenarios empty).\n",
    );
    return;
  }

  // Required agents based on flags. Default: both. Filter by --agent.
  const requestedAgents: Agent[] = flags.agent ? [flags.agent] : [...AGENTS];

  // Detect missing CLIs at startup; skip agents that aren't available.
  const usableAgents: Agent[] = [];
  for (const agent of requestedAgents) {
    if (await hasCommand(agent)) {
      usableAgents.push(agent);
    } else {
      process.stderr.write(
        `evals: \`${agent}\` CLI not found on PATH — skipping ${agent} runs. ` +
          `Install it and re-authenticate, then re-run.\n`,
      );
    }
  }
  if (usableAgents.length === 0) {
    process.stderr.write(
      "evals: no agent CLIs available. Install `claude` and/or `codex` and retry.\n",
    );
    process.exit(2);
    return;
  }

  // Filter fixtures / scenarios by flags.
  const fixturesToRun = registry.fixtures.filter(
    (f) => !flags.fixture || f.id === flags.fixture,
  );
  const scenariosToRun = allScenarios.filter((s) => {
    if (flags.scenario && s.kind !== flags.scenario) return false;
    return fixturesToRun.some((f) => f.id === s.fixture);
  });

  if (scenariosToRun.length === 0) {
    process.stdout.write(
      "evals: no scenarios match the supplied filters.\n",
    );
    return;
  }

  const crimesVersion = await readCrimesVersion();
  const outDir = resolve(RESULTS_DIR, crimesVersion);
  mkdirSync(outDir, { recursive: true });

  const summary = {
    crimes_version: crimesVersion,
    total_scenarios: 0,
    per_agent: {} as Record<string, { structural_pass_rate: number; scenarios_run: number }>,
    per_scenario_kind: {} as Record<ScenarioKind, Record<string, number>>,
  };
  const passByAgent = new Map<string, number>();
  const totalByAgent = new Map<string, number>();
  const passByAgentKind = new Map<string, number>();
  const totalByAgentKind = new Map<string, number>();

  let runCount = 0;
  for (const scenario of scenariosToRun) {
    const fixture = fixturesToRun.find((f) => f.id === scenario.fixture);
    if (!fixture) continue;
    const fixtureDir = resolve(REPO_ROOT, fixture.path);
    if (!existsSync(fixtureDir)) {
      process.stderr.write(
        `evals: fixture ${fixture.path} not found on disk — skip (run evals:setup?).\n`,
      );
      continue;
    }
    const scanJson = await runScan(fixtureDir);

    for (const agent of usableAgents) {
      runCount += 1;
      process.stdout.write(
        `evals: [${runCount}] ${agent} × ${scenario.id} (${fixture.name})\n`,
      );
      const runId = randomUUID();
      let agentResult: AgentRunResult;
      try {
        agentResult = await invokeAgent(agent, scenario, scanJson);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `evals: ${agent} × ${scenario.id} failed: ${message}\n`,
        );
        if (flags.bail) process.exit(1);
        continue;
      }
      const structural = scoreStructural(
        agentResult.response,
        scenario.expected_artifacts,
      );
      const result: ScoreResult = {
        scenario: scenario.id,
        agent,
        crimes_version: crimesVersion,
        timestamp: new Date().toISOString(),
        run_id: runId,
        structural_score: structural,
      };

      // Tally for summary.
      summary.total_scenarios += 1;
      const all = structural.passed + structural.failed;
      passByAgent.set(agent, (passByAgent.get(agent) ?? 0) + structural.passed);
      totalByAgent.set(agent, (totalByAgent.get(agent) ?? 0) + all);
      const kindKey = `${scenario.kind}::${agent}`;
      passByAgentKind.set(
        kindKey,
        (passByAgentKind.get(kindKey) ?? 0) + structural.passed,
      );
      totalByAgentKind.set(
        kindKey,
        (totalByAgentKind.get(kindKey) ?? 0) + all,
      );

      const agentDir = resolve(outDir, agent);
      mkdirSync(agentDir, { recursive: true });
      await writeJsonAtomic(
        resolve(agentDir, `${scenario.id}.json`),
        result,
      );
    }
  }

  // Build summary.json.
  for (const agent of usableAgents) {
    const total = totalByAgent.get(agent) ?? 0;
    const pass = passByAgent.get(agent) ?? 0;
    summary.per_agent[agent] = {
      structural_pass_rate: total === 0 ? 0 : round(pass / total),
      scenarios_run: scenariosToRun.length,
    };
  }
  for (const scenario of scenariosToRun) {
    const kind = scenario.kind as ScenarioKind;
    if (!summary.per_scenario_kind[kind]) summary.per_scenario_kind[kind] = {};
    for (const agent of usableAgents) {
      const key = `${kind}::${agent}`;
      const total = totalByAgentKind.get(key) ?? 0;
      const pass = passByAgentKind.get(key) ?? 0;
      summary.per_scenario_kind[kind][agent] = total === 0 ? 0 : round(pass / total);
    }
  }
  await writeJsonAtomic(resolve(outDir, "summary.json"), summary);

  process.stdout.write(
    `\nevals: done. ${summary.total_scenarios} run × scenario combinations.\n` +
      `Results: ${outDir}\n`,
  );
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { judge: false, bail: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--judge") flags.judge = true;
    else if (arg === "--bail") flags.bail = true;
    else if (arg === "--agent") {
      const value = args[++i] as Agent | undefined;
      if (value && (AGENTS as readonly string[]).includes(value)) {
        flags.agent = value;
      } else {
        process.stderr.write(
          `evals: --agent must be one of: ${AGENTS.join(", ")}\n`,
        );
        process.exit(2);
      }
    } else if (arg === "--fixture") {
      flags.fixture = args[++i];
    } else if (arg === "--scenario") {
      const value = args[++i] as ScenarioKind | undefined;
      const known: ScenarioKind[] = ["refactor", "bugfix", "review", "context", "plan"];
      if (value && known.includes(value)) {
        flags.scenario = value;
      } else {
        process.stderr.write(
          `evals: --scenario must be one of: ${known.join(", ")}\n`,
        );
        process.exit(2);
      }
    } else if (arg.startsWith("--")) {
      process.stderr.write(`evals: unknown flag ${arg}\n`);
      process.exit(2);
    }
  }
  return flags;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `evals: failed to parse ${file} — ${message}\n`,
      );
    }
  }
  return out;
}

async function hasCommand(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

async function runScan(fixtureDir: string): Promise<string> {
  const { stdout } = await execFileAsync("node", [CLI_DIST, "scan", fixtureDir, "--format", "json"], {
    maxBuffer: 1024 * 1024 * 32,
  });
  return stdout;
}

async function readCrimesVersion(): Promise<string> {
  const pkgPath = resolve(REPO_ROOT, "packages", "cli", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

async function invokeAgent(
  agent: Agent,
  scenario: Scenario,
  scanJson: string,
): Promise<AgentRunResult> {
  const prompt = composePrompt(scenario, scanJson);
  if (agent === "claude") {
    return invokeClaude({ prompt });
  }
  return invokeCodex({ prompt });
}

function composePrompt(scenario: Scenario, scanJson: string): string {
  return (
    `# Scenario: ${scenario.id} (kind: ${scenario.kind})\n\n` +
    `${scenario.prompt}\n\n` +
    `# crimes scan output (the context for your answer)\n\n` +
    "```json\n" +
    scanJson.trim() +
    "\n```\n"
  );
}

async function writeJsonAtomic(
  filePath: string,
  data: unknown,
): Promise<void> {
  // Write to a tempfile in the same dir, then rename — protects against
  // partial writes from a crashed run.
  await mkdir(dirname(filePath), { recursive: true });
  const tmpDir = await mkdtemp(join(tmpdir(), "crimes-eval-write-"));
  const tmpFile = join(tmpDir, "result.json");
  await writeFile(tmpFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmpFile, filePath);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`evals: ${message}\n`);
  process.exit(1);
});
