import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { discoverFiles, parseFile } from "@crimes/language-js";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import type { Finding, Severity } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import { builtInDetectors } from "./scan.js";

export interface ContextOptions {
  /** Repo-relative or absolute path to the file to inspect. */
  file: string;
  /** Repo root. Defaults to cwd. */
  root?: string;
  /** Override config explicitly. */
  config?: CrimesConfig;
  /** Override detectors. Defaults to all built-ins. */
  detectors?: Detector[];
}

export interface ContextRisk {
  /** Worst severity present in `findings`. `"none"` when there are none. */
  level: "none" | "low" | "medium" | "high";
  high: number;
  medium: number;
  low: number;
  /** Total finding count. */
  total: number;
}

export interface ContextReport {
  schema_version: typeof SCHEMA_VERSION;
  repo: { name: string; root: string };
  /** Repo-relative path to the inspected file, forward slashes. */
  file: string;
  risk: ContextRisk;
  findings: Finding[];
  /** Repo-relative paths of test files likely covering `file`. */
  likely_tests: string[];
  /** Deterministic, type-keyed safe-editing notes for an agent. */
  agent_guidance: string[];
}

/**
 * Per-finding-type guidance shown to agents in the human report and in
 * `agent_guidance`. Keep short and behavioural — not "fix this", but "don't
 * make it worse" before the agent edits.
 */
const GUIDANCE: Record<string, string> = {
  large_function:
    "Prefer extracting pure helpers before adding more branches.",
  large_file:
    "Read the whole file before editing — propose splits in their own change.",
  direct_date:
    "Avoid adding more direct clock access; inject time where possible.",
  todo_density:
    "Review TODOs before relying on comments as current intent.",
};

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_EXT = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;

export async function context(options: ContextOptions): Promise<ContextReport> {
  const root = resolve(options.root ?? process.cwd());
  const config = options.config ?? loadConfig(root);
  const detectors = options.detectors ?? builtInDetectors;

  const fileRel = toRepoRelative(root, options.file);
  const targetAbs = resolve(root, fileRel);

  const allFiles = await discoverFiles({
    root,
    include: config.include,
    exclude: config.exclude,
  });

  const findings = await runDetectorsOnTarget({
    allFiles,
    targetAbs,
    root,
    config,
    detectors,
  });

  const likely_tests = await findLikelyTests({ root, fileRel, targetAbs, allFiles });
  const agent_guidance = buildGuidance(findings);
  const risk = buildRisk(findings);

  return {
    schema_version: SCHEMA_VERSION,
    repo: { name: basename(root), root },
    file: fileRel,
    risk,
    findings,
    likely_tests,
    agent_guidance,
  };
}

async function runDetectorsOnTarget(args: {
  allFiles: string[];
  targetAbs: string;
  root: string;
  config: CrimesConfig;
  detectors: Detector[];
}): Promise<Finding[]> {
  const { allFiles, targetAbs, root, config, detectors } = args;
  if (!allFiles.includes(targetAbs)) return [];

  const file = toRepoPath(relative(root, targetAbs));
  const source = await readFile(targetAbs, "utf8");
  const parsed = parseFile({ absolutePath: targetAbs, source });

  const findings: Finding[] = [];
  for (const detector of detectors) {
    const detectorFindings = await detector.run({
      file,
      absolutePath: targetAbs,
      source,
      parsed,
      config,
    });
    findings.push(...detectorFindings);
  }
  sortFindings(findings);
  assignIds(findings);
  return findings;
}

function buildRisk(findings: Finding[]): ContextRisk {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;
  let level: ContextRisk["level"] = "none";
  if (counts.high > 0) level = "high";
  else if (counts.medium > 0) level = "medium";
  else if (counts.low > 0) level = "low";
  return { level, high: counts.high, medium: counts.medium, low: counts.low, total: findings.length };
}

function buildGuidance(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    if (seen.has(f.type)) continue;
    seen.add(f.type);
    const line = GUIDANCE[f.type];
    if (line) out.push(line);
  }
  return out;
}

async function findLikelyTests(args: {
  root: string;
  fileRel: string;
  targetAbs: string;
  allFiles: string[];
}): Promise<string[]> {
  const { root, fileRel, targetAbs, allFiles } = args;
  const targetBaseNoExt = basename(fileRel).replace(SOURCE_EXT, "");
  const result = new Set<string>();

  for (const abs of allFiles) {
    if (abs === targetAbs) continue;
    const rel = toRepoPath(relative(root, abs));
    const b = basename(rel);

    // Sibling .test/.spec files matching the basename
    if (TEST_EXT.test(b)) {
      const noTest = b.replace(TEST_EXT, "");
      if (noTest === targetBaseNoExt) {
        result.add(rel);
        continue;
      }
    }

    // Files under any __tests__ directory matching the basename
    if (rel.split("/").includes("__tests__")) {
      const noTest = b.replace(TEST_EXT, "");
      if (noTest === targetBaseNoExt) {
        result.add(rel);
      }
    }
  }

  // Test files that import the target via a relative path. Restrict to test
  // files only — `likely_tests` should not list arbitrary consumers.
  for (const abs of allFiles) {
    if (abs === targetAbs) continue;
    const rel = toRepoPath(relative(root, abs));
    if (result.has(rel)) continue;
    if (!isTestFile(rel)) continue;

    let source: string;
    try {
      source = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (importsTarget({ source, fromAbs: abs, targetAbs })) {
      result.add(rel);
    }
  }

  return [...result].sort();
}

function isTestFile(rel: string): boolean {
  return TEST_EXT.test(basename(rel)) || rel.split("/").includes("__tests__");
}

function importsTarget(args: {
  source: string;
  fromAbs: string;
  targetAbs: string;
}): boolean {
  const { source, fromAbs, targetAbs } = args;
  const fromDir = dirname(fromAbs);

  // Strip extension and `/index` suffix from the target so we match the same
  // shapes a user would actually write in an `import` statement.
  const targetNoExt = targetAbs.replace(SOURCE_EXT, "");
  let rel = relative(fromDir, targetNoExt);
  rel = rel.split(sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;

  const candidates = new Set<string>([
    rel,
    `${rel}.ts`,
    `${rel}.tsx`,
    `${rel}.js`,
    `${rel}.jsx`,
    `${rel}.mjs`,
    `${rel}.cjs`,
  ]);

  // Also handle `from "./dir"` resolving to `./dir/index.*` if the basename
  // of the target is `index`.
  if (basename(targetNoExt) === "index") {
    const parent = rel.replace(/\/index$/, "");
    candidates.add(parent);
  }

  for (const c of candidates) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:from|require|import)\\s*\\(?\\s*["']${escaped}["']`,
    );
    if (re.test(source)) return true;
  }
  return false;
}

function toRepoRelative(root: string, file: string): string {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  return toRepoPath(relative(root, abs));
}

function toRepoPath(p: string): string {
  return p.split(sep).join("/");
}

function sortFindings(findings: Finding[]): void {
  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => {
    const sev = order[a.severity] - order[b.severity];
    if (sev !== 0) return sev;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.lines?.[0] ?? 0) - (b.lines?.[0] ?? 0);
  });
}

function assignIds(findings: Finding[]): void {
  findings.forEach((f, i) => {
    f.id = `crime_${String(i + 1).padStart(5, "0")}`;
  });
}
