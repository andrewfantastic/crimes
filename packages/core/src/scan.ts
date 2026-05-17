import { readFile, realpath } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { discoverFiles, parseFile } from "@crimes/language-js";
import type { FailOn } from "./baseline.js";
import { severityAtLeast } from "./baseline.js";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { accessibleInteractionRiskDetector } from "./detectors/accessible-interaction-risk.js";
import { actionLabelDriftDetector } from "./detectors/action-label-drift.js";
import { circularDependencyDetector } from "./detectors/circular-dependency.js";
import { commandDriftDocsCodeDriftDetector } from "./detectors/command-drift-docs-code-drift.js";
import { commentedOutCodeDetector } from "./detectors/commented-out-code.js";
import { conceptAliasDriftDetector } from "./detectors/concept-alias-drift.js";
import { copyIaDriftDetector } from "./detectors/copy-ia-drift.js";
import { deepImportDetector } from "./detectors/deep-import.js";
import { designTokenEscapeDetector } from "./detectors/design-token-escape.js";
import { directDateDetector } from "./detectors/direct-date.js";
import { docsCodeDriftDetector } from "./detectors/docs-code-drift.js";
import { duplicateComponentShapeDetector } from "./detectors/duplicate-component-shape.js";
import { duplicatedNavigationSourceDetector } from "./detectors/duplicated-navigation-source.js";
import { duplicatedRoleStatusPlanCheckDetector } from "./detectors/duplicated-role-status-plan-check.js";
import { exactDuplicateBlockDetector } from "./detectors/exact-duplicate-block.js";
import { highFanInFanOutDetector } from "./detectors/high-fan-in-fan-out.js";
import { largeFileDetector } from "./detectors/large-file.js";
import { largeFunctionDetector } from "./detectors/large-function.js";
import { layerViolationDetector } from "./detectors/layer-violation.js";
import { logicInCommentsDetector } from "./detectors/logic-in-comments.js";
import { magicDomainLiteralScatterDetector } from "./detectors/magic-domain-literal-scatter.js";
import { missingAgentContextDetector } from "./detectors/missing-agent-context.js";
import { nameBehaviorMismatchDetector } from "./detectors/name-behavior-mismatch.js";
import { nearDuplicateBlockDetector } from "./detectors/near-duplicate-block.js";
import { negativeFlagMazeDetector } from "./detectors/negative-flag-maze.js";
import { optionBagJunkDrawerDetector } from "./detectors/option-bag-junk-drawer.js";
import { orphanedDestinationDetector } from "./detectors/orphaned-destination.js";
import { parallelDestinationDetector } from "./detectors/parallel-destination.js";
import { permissionIaDriftDetector } from "./detectors/permission-ia-drift.js";
import { responsiveFragilityDetector } from "./detectors/responsive-fragility.js";
import { returnShapeRouletteDetector } from "./detectors/return-shape-roulette.js";
import { routeMetadataDriftDetector } from "./detectors/route-metadata-drift.js";
import { todoDensityDetector } from "./detectors/todo-density.js";
import { visualRegressionReviewHintDetector } from "./detectors/visual-regression-review-hint.js";
import { weakTestSignalDetector } from "./detectors/weak-test-signal.js";
import type { Finding, ScanReport, ScanSummary } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import { getChangedFiles } from "./git/changed-files.js";
import { DEFAULT_ALIAS_GROUPS } from "./ia/aliases.js";
import { buildIaIndex } from "./ia/build.js";
import type { IaConceptAliasGroup, IaIndex } from "./ia/types.js";
import { buildImportGraph } from "./imports/build.js";
import type { ImportGraph } from "./imports/types.js";
import { buildJsxShapeIndex } from "./jsx/shape-index.js";
import type { JsxShapeIndex } from "./jsx/shape-index.js";
import { buildFunctionHashIndex } from "./ast-hash/function-index.js";
import type { FunctionHashIndex } from "./ast-hash/function-index.js";
import { buildPettyIndex } from "./petty/build.js";
import type { PettyIndex } from "./petty/types.js";
import {
  buildScoringContext,
  finaliseFindingScores,
} from "./scoring/build.js";
import type { ScoringContext } from "./scoring/build.js";
import type {
  ApplySuppressionsOptions,
  SuppressionEntry,
} from "./suppressions.js";
import { partitionFindings } from "./suppressions.js";

export const builtInDetectors: Detector[] = [
  // Structural / file-local detectors (run first; they make up the bulk of
  // findings on most repos and don't depend on cross-file analysis).
  largeFileDetector,
  largeFunctionDetector,
  todoDensityDetector,
  directDateDetector,
  // Petty crimes (small local patterns that increase agent confusion).
  commentedOutCodeDetector,
  logicInCommentsDetector,
  nameBehaviorMismatchDetector,
  magicDomainLiteralScatterDetector,
  weakTestSignalDetector,
  optionBagJunkDrawerDetector,
  returnShapeRouletteDetector,
  negativeFlagMazeDetector,
  // Information-architecture detectors (cross-file; require ctx.ia).
  missingAgentContextDetector,
  routeMetadataDriftDetector,
  duplicatedNavigationSourceDetector,
  conceptAliasDriftDetector,
  docsCodeDriftDetector,
  orphanedDestinationDetector,
  parallelDestinationDetector,
  permissionIaDriftDetector,
  actionLabelDriftDetector,
  copyIaDriftDetector,
  commandDriftDocsCodeDriftDetector,
  // Dependency-graph + architecture (require ctx.imports).
  layerViolationDetector,
  circularDependencyDetector,
  deepImportDetector,
  highFanInFanOutDetector,
  // Frontend / UI agent-risk (require ctx.parsed.jsxElements).
  designTokenEscapeDetector,
  accessibleInteractionRiskDetector,
  duplicateComponentShapeDetector,
  responsiveFragilityDetector,
  visualRegressionReviewHintDetector,
  // Duplication (require ctx.functionHashIndex / ctx.ia).
  exactDuplicateBlockDetector,
  nearDuplicateBlockDetector,
  duplicatedRoleStatusPlanCheckDetector,
];

export interface ScanOptions {
  /** Absolute or relative path to scan. Defaults to cwd. */
  root?: string;
  /** Override config explicitly. */
  config?: CrimesConfig;
  /** Override detectors. Defaults to all built-ins. */
  detectors?: Detector[];
  /**
   * Restrict the scan to files changed in the working tree (and, when
   * `base` is also set, between `<base>...HEAD`). Requires `root` to be
   * inside a Git repository.
   */
  changed?: boolean;
  /**
   * Optional Git ref to compare against, e.g. `"main"` or `"origin/main"`.
   * Only meaningful when `changed` is true.
   */
  base?: string;
}

export async function scan(options: ScanOptions = {}): Promise<ScanReport> {
  const root = resolve(options.root ?? process.cwd());
  const config = options.config ?? loadConfig(root);
  const detectors =
    options.detectors ?? filterDetectors(builtInDetectors, config);

  const allFiles = await discoverFiles({
    root,
    include: config.include,
    exclude: config.exclude,
  });

  let changedAll: string[] | undefined;
  let files: string[];
  if (options.changed) {
    const restricted = await restrictToChanged({
      root,
      allFiles,
      base: options.base,
    });
    files = restricted.scanFiles;
    changedAll = restricted.allChangedRepoPaths;
  } else {
    files = allFiles;
  }

  // Build the IA index over the FULL discovered file set, not just the
  // changed slice -- IA findings are cross-file by definition. `--changed`
  // gates only finding emission, not the underlying signal.
  const ia = await safelyBuildIaIndex({
    root,
    allFiles,
    aliasGroups: resolveAliasGroups(config),
  });
  const petty = await safelyBuildPettyIndex({ root, allFiles });
  // The import graph is also a cross-file index — build it over `allFiles`
  // so that dependency-graph detectors and `scores.blast_radius` see the
  // full picture, not just the `--changed` slice.
  const imports = await safelyBuildImportGraph({ root, allFiles });
  const jsxShapeIndex = await safelyBuildJsxShapeIndex({ root, allFiles });
  const functionHashIndex = await safelyBuildFunctionHashIndex({ root, allFiles });
  // Scoring context: built once, queried per-finding during finalisation.
  // Always present (degrades gracefully when git is unavailable).
  const scoring = await safelyBuildScoringContext({
    root,
    allFiles,
    imports,
  });

  const findings: Finding[] = [];

  for (const absolutePath of files) {
    const file = toRepoPath(relative(root, absolutePath));
    const source = await readFile(absolutePath, "utf8");
    const parsed = parseFile({ absolutePath, source });

    for (const detector of detectors) {
      const detectorFindings = await detector.run({
        file,
        absolutePath,
        source,
        parsed,
        config,
        ia,
        petty,
        imports,
        jsxShapeIndex,
        functionHashIndex,
        scoring,
      });
      findings.push(...detectorFindings);
    }
  }

  // Backfill the per-finding scoring fields (churn / test_gap /
  // blast_radius) and recompute `agent_risk` from the unified 0.6.0
  // formula. Done once after all detectors have emitted so the
  // signal-source code lives in one place, not 17.
  for (const f of findings) {
    finaliseFindingScores(f, scoring);
  }

  const sorted = sortFindings(findings);
  assignIds(sorted);

  const report: ScanReport = {
    schema_version: SCHEMA_VERSION,
    report_type: "scan",
    repo: {
      name: basename(root),
      root,
    },
    summary: summarise(sorted),
    findings: sorted,
  };
  if (changedAll !== undefined) {
    report.changed_files = changedAll;
  }
  return report;
}

/**
 * Filter a {@link ScanReport} through the suppressions list. Returns a
 * new report with `findings` partitioned, `summary` recomputed, and an
 * optional `suppressed_count` set when ≥1 entry matched. Pure — does not
 * mutate the input.
 */
export function applySuppressionsToScan(
  report: ScanReport,
  suppressions: SuppressionEntry[],
  options: ApplySuppressionsOptions,
): ScanReport {
  const { visible, suppressedCount } = partitionFindings(
    report.findings,
    suppressions,
    options,
  );
  const next: ScanReport = {
    ...report,
    summary: summariseVisible(visible),
    findings: visible,
  };
  if (suppressedCount > 0) next.suppressed_count = suppressedCount;
  return next;
}

function summariseVisible(findings: Finding[]): ScanSummary {
  const summary: ScanSummary = { total: findings.length, high: 0, medium: 0, low: 0 };
  for (const f of findings) summary[f.severity] += 1;
  return summary;
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

async function safelyBuildJsxShapeIndex(args: {
  root: string;
  allFiles: string[];
}): Promise<JsxShapeIndex | undefined> {
  try {
    return await buildJsxShapeIndex({ root: args.root, files: args.allFiles });
  } catch {
    return undefined;
  }
}

async function safelyBuildFunctionHashIndex(args: {
  root: string;
  allFiles: string[];
}): Promise<FunctionHashIndex | undefined> {
  try {
    return await buildFunctionHashIndex({ root: args.root, files: args.allFiles });
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

function toRepoPath(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Build the IA index, but never let a failure here break the scan.
 * Returns `undefined` on any error -- detectors that need the index
 * (IA detectors) should treat absence as "skip this finding kind", not
 * as a fatal condition.
 */
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

/**
 * Resolve the alias-group catalogue used to build the IA index.
 *
 * Config groups are **additive** to the built-in defaults: an entry that
 * shares an `id` with a default group is appended verbatim (the
 * concept_alias_drift detector dedupes hits per group, so duplicates are
 * harmless). A future `ia.aliasGroupsReplace: true` opt-in could swap
 * "additive" for "replace" — see SUPPRESSIONS_CONFIG_EXPLAIN_PLAN.md §3.B.
 */
export function resolveAliasGroups(
  config: CrimesConfig,
): IaConceptAliasGroup[] {
  const overrides = config.ia?.aliasGroups ?? [];
  if (overrides.length === 0) return DEFAULT_ALIAS_GROUPS;
  return [...DEFAULT_ALIAS_GROUPS, ...overrides];
}

/**
 * Apply `config.detectors.enable` / `config.detectors.disable` to the
 * built-in detector list. Returns a new array; never mutates the input.
 *
 * `enable` is an allowlist (empty / omitted means "all built-ins").
 * `disable` runs **after** `enable` so a user can shrink the set in two
 * passes if they want to. An unknown id in either list raises
 * {@link UnknownDetectorError} — typos should not silently no-op.
 */
export function filterDetectors(
  available: Detector[],
  config: CrimesConfig,
): Detector[] {
  const enable = config.detectors?.enable ?? [];
  const disable = config.detectors?.disable ?? [];
  const knownIds = new Set(available.map((d) => d.id));

  for (const id of enable) {
    if (!knownIds.has(id)) throw new UnknownDetectorError(id);
  }
  for (const id of disable) {
    if (!knownIds.has(id)) throw new UnknownDetectorError(id);
  }

  let pool = available;
  if (enable.length > 0) {
    const enableSet = new Set(enable);
    pool = pool.filter((d) => enableSet.has(d.id));
  }
  if (disable.length > 0) {
    const disableSet = new Set(disable);
    pool = pool.filter((d) => !disableSet.has(d.id));
  }
  return pool;
}

export class UnknownDetectorError extends Error {
  id: string;
  constructor(id: string) {
    super(
      `unknown detector id "${id}" in crimes.config.json. ` +
        `Check the spelling against the built-in detector list in ` +
        `docs/finding-types/.`,
    );
    this.name = "UnknownDetectorError";
    this.id = id;
  }
}

interface RestrictToChangedResult {
  /**
   * Absolute paths that the detectors should actually process —
   * intersection of `allFiles` (discoverable source files) with the set
   * of files git reports as changed. Realpath-normalised on both sides
   * so macOS `/var` vs `/private/var` lines up.
   */
  scanFiles: string[];
  /**
   * Every changed file git returned, normalised to repo-relative POSIX
   * paths and sorted. Includes files that aren't in the discoverable
   * source set (markdown, JSON, lockfiles, etc.) — surfaced verbatim in
   * `ScanReport.changed_files` so an agent can confirm what it touched
   * even when the diff is clean.
   */
  allChangedRepoPaths: string[];
}

async function restrictToChanged(args: {
  root: string;
  allFiles: string[];
  base?: string;
}): Promise<RestrictToChangedResult> {
  const { root, allFiles, base } = args;
  const changedAbs = await getChangedFiles({ root, base });

  // `git rev-parse --show-toplevel` returns the canonicalised repo path
  // (e.g. /private/var/folders/... on macOS). `discoverFiles` returns
  // whatever path was passed in, which may still be the /var/... symlink.
  // Compare on realpaths so the intersection works.
  const changedReal = new Set<string>();
  for (const abs of changedAbs) {
    changedReal.add(await safeRealpath(abs));
  }

  const scanFiles: string[] = [];
  for (const abs of allFiles) {
    if (changedReal.has(await safeRealpath(abs))) scanFiles.push(abs);
  }

  // Repo-relative POSIX list of every change git reported — even files
  // outside the discoverable source set. This is the `changed_files`
  // ScanReport field; sort + dedupe so the output is deterministic.
  const rootReal = await safeRealpath(root);
  const seenRepoPaths = new Set<string>();
  for (const abs of changedAbs) {
    const real = await safeRealpath(abs);
    const rel = toRepoPath(relative(rootReal, real));
    if (rel.length === 0) continue;
    seenRepoPaths.add(rel);
  }
  const allChangedRepoPaths = [...seenRepoPaths].sort();

  return { scanFiles, allChangedRepoPaths };
}

async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

function sortFindings(findings: Finding[]): Finding[] {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...findings].sort((a, b) => {
    const sev = order[a.severity] - order[b.severity];
    if (sev !== 0) return sev;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return (a.lines?.[0] ?? 0) - (b.lines?.[0] ?? 0);
  });
}

function assignIds(findings: Finding[]): void {
  findings.forEach((finding, index) => {
    finding.id = `crime_${String(index + 1).padStart(5, "0")}`;
  });
}

function summarise(findings: Finding[]): ScanSummary {
  const summary: ScanSummary = { total: findings.length, high: 0, medium: 0, low: 0 };
  for (const f of findings) summary[f.severity] += 1;
  return summary;
}

/**
 * Annotate a {@link ScanReport} with the CI gate decision for
 * `crimes scan --changed --fail-on`. Returns a new report carrying the
 * threshold (`fail_on`) and a boolean (`failed`) that flips to `true` when
 * at least one finding meets or exceeds the threshold.
 *
 * Pure — does not mutate the input. Reuses {@link severityAtLeast} so the
 * threshold semantics match `crimes baseline check`.
 */
export function applyScanFailOn(
  report: ScanReport,
  failOn: FailOn,
): ScanReport {
  // Suppressed findings (only present when --show-suppressed was set)
  // never trip the gate — gate semantics are independent of display.
  const failed = report.findings.some(
    (f) => f.suppressed !== true && severityAtLeast(f.severity, failOn),
  );
  return { ...report, fail_on: failOn, failed };
}
