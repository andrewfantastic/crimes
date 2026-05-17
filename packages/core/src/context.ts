import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { discoverFiles, parseFile } from "@crimes/language-js";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { ContextRelatedFile } from "./context-related-files.js";
import { findRelatedFiles } from "./context-related-files.js";
import type { Detector } from "./detector.js";
import type { Finding, Severity } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import { buildIaIndex } from "./ia/build.js";
import type { IaConceptAliasGroup, IaIndex } from "./ia/types.js";
import { buildImportGraph } from "./imports/build.js";
import type { ImportGraph } from "./imports/types.js";
import { buildPettyIndex } from "./petty/build.js";
import type { PettyIndex } from "./petty/types.js";
import {
  buildScoringContext,
  finaliseFindingScores,
} from "./scoring/build.js";
import type { ScoringContext } from "./scoring/build.js";
import {
  builtInDetectors,
  filterDetectors,
  resolveAliasGroups,
} from "./scan.js";
import type {
  ApplySuppressionsOptions,
  SuppressionEntry,
} from "./suppressions.js";
import { partitionFindings } from "./suppressions.js";

export interface ContextOptions {
  /** Repo-relative or absolute path to the file to inspect. */
  file: string;
  /**
   * Explicit scan root. When omitted, `context()` walks up from the target
   * file to the nearest enclosing `package.json` and uses that directory as
   * the root; this makes `crimes context <nested-package-file>` work the
   * same from the monorepo root as from inside the nested package. When
   * provided, the value wins unconditionally — `--root` is the user
   * override and `context()` does not climb above it.
   */
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
  /** Discriminator. Always the literal `"context"`. */
  report_type: "context";
  repo: { name: string; root: string };
  /** Repo-relative path to the inspected file, forward slashes. */
  file: string;
  risk: ContextRisk;
  /** Deterministic, type-keyed safe-editing notes for an agent. */
  agent_guidance: string[];
  /**
   * Other files an agent should probably read before editing the target.
   * Discovered deterministically — IA finding passthrough, shared path
   * tokens, domain-prefix filename matches, same-directory siblings.
   * Always present (empty array when nothing fired); see
   * `related_files_reason` for the empty case.
   */
  related_files: ContextRelatedFile[];
  /** Repo-relative paths of test files likely covering `file`. */
  likely_tests: string[];
  /** Same Finding shape as `crimes scan`, filtered to the target file. */
  findings: Finding[];
  /**
   * Only present when `agent_guidance` is empty. Short string explaining
   * why — keeps `[]` from being read as "we didn't look".
   */
  agent_guidance_reason?: string;
  /**
   * Only present when `related_files` is empty. Short string explaining
   * why no neighbourhood file fired.
   */
  related_files_reason?: string;
  /**
   * Only present when `likely_tests` is empty. Short string explaining
   * what conventions were searched without a hit.
   */
  likely_tests_reason?: string;
  /**
   * Number of findings matched by an entry in `.crimes/suppressions.json`.
   * Only present when ≥1 suppression matched.
   */
  suppressed_count?: number;
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
  commented_out_code:
    "Do not copy disabled code from comments; verify whether it should be deleted or explained as rationale.",
  logic_in_comments:
    "Treat prose-only rules as suspect; encode them in guards, tests, config, or types before relying on them.",
  name_behavior_mismatch:
    "Safe-sounding names may hide side effects — inspect callers before moving, caching, or duplicating them.",
  magic_domain_literal_scatter:
    "Repeated domain literals can be duplicated policy — find or create the source of truth before adding another copy.",
  weak_test_signal:
    "Nearby tests may not protect behaviour; inspect assertions before treating them as safety coverage.",
  option_bag_junk_drawer:
    "Generic object bags hide required shape — identify the actual fields before adding or renaming properties.",
  return_shape_roulette:
    "This function returns multiple object shapes; check every caller before depending on one result shape.",
  negative_flag_maze:
    "Multiple negative flags make predicates easy to invert — simplify or name the predicate before extending it.",
  missing_agent_context:
    "Agents may miss project-specific commands, architecture rules, and safety checks.",
  route_metadata_drift:
    "The route path, title, breadcrumb, and component name appear to disagree — verify each before changing labels.",
  duplicated_navigation_source:
    "Multiple files declare this destination; updating only one will leave the others stale.",
  concept_alias_drift:
    "Other files describe this concept under a different name; read them before renaming or extending.",
  docs_code_drift:
    "Docs reference local files that no longer exist — update the docs in the same PR.",
};

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Matches every test-file naming convention `findLikelyTests` honours:
 *
 *   foo.test.ts / foo.spec.ts           — Jest / Vitest infix convention
 *   foo_test.ts / foo_spec.ts           — Go-style underscore suffix
 *
 * Used both to recognise candidate test files and to strip the suffix back
 * to a target basename for matching. Keep the two halves of the alternation
 * symmetric so `stripTestSuffix` stays a simple `.replace(TEST_EXT, "")`.
 */
const TEST_EXT =
  /(?:\.(?:test|spec)|_(?:test|spec))\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Walk upward from `start` (a directory path) looking for an enclosing
 * `package.json`. Returns the absolute path of the directory that contains
 * it, or `undefined` if none is found before the filesystem root.
 *
 * The walk is bounded by the filesystem root — there is no separate stop
 * condition, so callers that want to confine the search to a specific
 * subtree should resolve `start` and check against that subtree themselves.
 *
 * Callers should pass an already-canonicalised (realpath'd) directory so
 * the returned root matches the canonical form of any sibling absolute
 * paths the caller will compare against — `context()` realpaths the
 * target file before calling in, which keeps all comparisons consistent.
 */
export async function findNearestPackageRoot(
  start: string,
): Promise<string | undefined> {
  let dir = resolve(start);
  // Guard against `parse(dir).root === dir` looping forever on filesystem root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir || parent === parse(dir).root) {
      // Final check at the filesystem root before giving up.
      if (existsSync(join(parent, "package.json"))) return parent;
      return undefined;
    }
    dir = parent;
  }
}

async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

/**
 * Resolve the scan root for a `context()` call.
 *
 *   1. If the caller passed an explicit `--root`, honour it verbatim.
 *   2. Otherwise, walk up from the target file's directory to the nearest
 *      enclosing `package.json` and use that directory.
 *   3. If no `package.json` exists above the target, fall back to
 *      `process.cwd()` — the historical default.
 *
 * Step 2 is the fix for "monorepo root: `crimes context
 * examples/pkg/src/foo.ts` returns no findings". The target file lives
 * inside a workspace package with its own `package.json`; we want the
 * scan to be scoped to that package, not the whole monorepo.
 */
async function resolveContextRoot(args: {
  targetAbs: string;
  explicitRoot: string | undefined;
}): Promise<string> {
  if (args.explicitRoot !== undefined) {
    // Canonicalise so it lines up with the realpath'd targetAbs.
    return safeRealpath(resolve(args.explicitRoot));
  }
  const packageRoot = await findNearestPackageRoot(dirname(args.targetAbs));
  if (packageRoot) return packageRoot;
  return safeRealpath(resolve(process.cwd()));
}

export async function context(options: ContextOptions): Promise<ContextReport> {
  const cwd = resolve(process.cwd());
  const initialRoot = resolve(options.root ?? cwd);
  const targetInput = isAbsolute(options.file)
    ? resolve(options.file)
    : resolve(initialRoot, options.file);
  // Canonicalise the target path so symlinked temp dirs (macOS /var vs
  // /private/var) line up with the discovered package root, which is also
  // canonicalised. Without this, `relative(root, targetAbs)` produces
  // `../../private/var/...` paths on darwin temp dirs.
  const targetAbs = await safeRealpath(targetInput);

  const root = await resolveContextRoot({
    targetAbs,
    explicitRoot: options.root,
  });
  const config = options.config ?? loadConfig(root);
  const detectors =
    options.detectors ?? filterDetectors(builtInDetectors, config);

  const fileRel = toRepoRelative(root, targetAbs);

  const allFiles = await discoverFiles({
    root,
    include: config.include,
    exclude: config.exclude,
  });

  // Cross-file indexes are built over the WHOLE repo so single-file context
  // still gets repo-level IA and petty-crimes signal.
  const ia = await safelyBuildIaIndex({
    root,
    allFiles,
    aliasGroups: resolveAliasGroups(config),
  });
  const petty = await safelyBuildPettyIndex({ root, allFiles });
  const imports = await safelyBuildImportGraph({ root, allFiles });
  const scoring = await safelyBuildScoringContext({
    root,
    allFiles,
    imports,
  });

  const findings = await runDetectorsOnTarget({
    allFiles,
    targetAbs,
    root,
    config,
    detectors,
    ia,
    petty,
    imports,
    scoring,
  });

  const likely_tests = await findLikelyTests({ root, fileRel, targetAbs, allFiles });

  // Repo-relative POSIX paths for every discovered file — the
  // related-files helper works in that vocabulary so it can compare
  // against IA index keys without re-resolving.
  const allFilesRel = allFiles.map((abs) =>
    toRepoPath(relative(root, abs)),
  );
  const related_files = findRelatedFiles({
    fileRel,
    allFilesRel,
    ia,
    findings,
    likelyTests: likely_tests,
  });

  const agent_guidance = buildGuidance(findings, related_files);
  const risk = buildRisk(findings);

  // Key ordering inside the literal matters — `JSON.stringify` preserves
  // insertion order, and `agent_guidance` is the field agents read first,
  // so it goes ahead of `findings`. Optional `*_reason` fields are placed
  // immediately after the array they explain so a human scanning the JSON
  // can find them in one breath.
  const report: ContextReport = {
    schema_version: SCHEMA_VERSION,
    report_type: "context",
    repo: { name: basename(root), root },
    file: fileRel,
    risk,
    agent_guidance,
    related_files,
    likely_tests,
    findings,
  };

  if (agent_guidance.length === 0) {
    report.agent_guidance_reason =
      findings.length === 0 && related_files.length === 0
        ? "no findings on this file and no deterministic related files"
        : "findings on this file did not match any keyed guidance line";
  }
  if (related_files.length === 0) {
    report.related_files_reason =
      "no neighbourhood signal: no IA finding related_files, no shared domain tokens, no domain-prefix filenames, no same-directory siblings";
  }
  if (likely_tests.length === 0) {
    report.likely_tests_reason =
      "no sibling, __tests__, .test, .spec, _test, or _spec files matched the target basename";
  }

  return report;
}

/**
 * Filter a {@link ContextReport} through the suppressions list. Same
 * shape as {@link applySuppressionsToScan} — pure, returns a new report,
 * recomputes the `risk` totals from the visible set.
 */
export function applySuppressionsToContext(
  report: ContextReport,
  suppressions: SuppressionEntry[],
  options: ApplySuppressionsOptions,
): ContextReport {
  const { visible, suppressedCount } = partitionFindings(
    report.findings,
    suppressions,
    options,
  );
  const next: ContextReport = {
    ...report,
    findings: visible,
    risk: buildRisk(visible),
  };
  if (suppressedCount > 0) next.suppressed_count = suppressedCount;
  return next;
}

async function runDetectorsOnTarget(args: {
  allFiles: string[];
  targetAbs: string;
  root: string;
  config: CrimesConfig;
  detectors: Detector[];
  ia?: IaIndex;
  petty?: PettyIndex;
  imports?: ImportGraph;
  scoring?: ScoringContext;
}): Promise<Finding[]> {
  const {
    allFiles,
    targetAbs,
    root,
    config,
    detectors,
    ia,
    petty,
    imports,
    scoring,
  } = args;
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
      ia,
      petty,
      imports,
      scoring,
    });
    findings.push(...detectorFindings);
  }

  // Backfill per-finding scores (churn / test_gap / blast_radius) and
  // recompute agent_risk from the unified formula. Detectors that ran
  // before scoring landed may have set agent_risk themselves; the
  // finalisation pass overwrites with the canonical value.
  for (const f of findings) {
    finaliseFindingScores(f, scoring);
  }

  // `crimes context <file>` must only show findings that are *about*
  // <file>. IA detectors fire at scan time using a deterministic anchor
  // file (e.g. the lex-first source file in the repo), which may not be
  // the target. Keep only findings whose `.file` or `.related_files`
  // reference the target.
  const relevant = findings.filter(
    (f) => f.file === file || (f.related_files ?? []).includes(file),
  );

  sortFindings(relevant);
  assignIds(relevant);
  return relevant;
}

async function safelyBuildIaIndex(args: {
  root: string;
  allFiles: string[];
  aliasGroups?: IaConceptAliasGroup[];
}): Promise<IaIndex | undefined> {
  try {
    return await buildIaIndex({
      root: args.root,
      files: args.allFiles,
      ...(args.aliasGroups !== undefined
        ? { aliasGroups: args.aliasGroups }
        : {}),
    });
  } catch {
    return undefined;
  }
}

async function safelyBuildPettyIndex(args: {
  root: string;
  allFiles: string[];
}): Promise<PettyIndex | undefined> {
  try {
    return await buildPettyIndex({ root: args.root, files: args.allFiles });
  } catch {
    return undefined;
  }
}

async function safelyBuildImportGraph(args: {
  root: string;
  allFiles: string[];
}): Promise<ImportGraph | undefined> {
  try {
    return await buildImportGraph({ root: args.root, files: args.allFiles });
  } catch {
    return undefined;
  }
}

async function safelyBuildScoringContext(args: {
  root: string;
  allFiles: string[];
  imports: ImportGraph | undefined;
}): Promise<ScoringContext | undefined> {
  try {
    return await buildScoringContext({
      root: args.root,
      files: args.allFiles,
      imports: args.imports,
    });
  } catch {
    return undefined;
  }
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

/**
 * Guidance line emitted when a file has no findings but does have
 * deterministic related files. Keeps the "Agent guidance" block
 * non-empty in the common neighbourhood-only case (an agent landed on a
 * clean route file, but other files clearly share its domain).
 */
const NEIGHBOURHOOD_GUIDANCE =
  "Review related files before editing — they share domain tokens or route/navigation evidence with this target.";

function buildGuidance(
  findings: Finding[],
  relatedFiles: ContextRelatedFile[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    if (seen.has(f.type)) continue;
    seen.add(f.type);
    const line = GUIDANCE[f.type];
    if (line) out.push(line);
  }
  // Add the neighbourhood line only when nothing else fired — when a
  // finding-keyed guidance line is already present, the IA wording
  // ("read them before renaming or extending", etc.) already covers
  // related files. Adding both would dilute the more specific line.
  if (out.length === 0 && relatedFiles.length > 0) {
    out.push(NEIGHBOURHOOD_GUIDANCE);
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

    // Sibling files matching one of the test-naming conventions
    // (`foo.test.ts`, `foo.spec.tsx`, `foo_test.ts`, `foo_spec.ts`).
    if (TEST_EXT.test(b)) {
      const noTest = stripTestSuffix(b);
      if (noTest === targetBaseNoExt) {
        result.add(rel);
        continue;
      }
    }

    // Files under any __tests__ directory matching the basename. Same
    // suffix-stripping rules — covers `__tests__/foo.test.ts` AND
    // `__tests__/foo_test.ts`.
    if (rel.split("/").includes("__tests__")) {
      const noTest = stripTestSuffix(b);
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

/**
 * Strip a test-naming suffix from a basename to recover the "subject under
 * test" basename. Symmetric with {@link TEST_EXT} — `foo.test.ts` returns
 * `foo`, `foo_test.ts` returns `foo`. Returns the input unchanged when it
 * doesn't match either convention.
 */
function stripTestSuffix(basenameWithExt: string): string {
  return basenameWithExt.replace(TEST_EXT, "");
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
