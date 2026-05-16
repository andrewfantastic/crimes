import { readFile, realpath } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { discoverFiles, parseFile } from "@crimes/language-js";
import type { FailOn } from "./baseline.js";
import { severityAtLeast } from "./baseline.js";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { conceptAliasDriftDetector } from "./detectors/concept-alias-drift.js";
import { directDateDetector } from "./detectors/direct-date.js";
import { docsCodeDriftDetector } from "./detectors/docs-code-drift.js";
import { duplicatedNavigationSourceDetector } from "./detectors/duplicated-navigation-source.js";
import { largeFileDetector } from "./detectors/large-file.js";
import { largeFunctionDetector } from "./detectors/large-function.js";
import { missingAgentContextDetector } from "./detectors/missing-agent-context.js";
import { routeMetadataDriftDetector } from "./detectors/route-metadata-drift.js";
import { todoDensityDetector } from "./detectors/todo-density.js";
import type { Finding, ScanReport, ScanSummary } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import { getChangedFiles } from "./git/changed-files.js";
import { buildIaIndex } from "./ia/build.js";
import type { IaIndex } from "./ia/types.js";

export const builtInDetectors: Detector[] = [
  // Structural / file-local detectors (run first; they make up the bulk of
  // findings on most repos and don't depend on cross-file analysis).
  largeFileDetector,
  largeFunctionDetector,
  todoDensityDetector,
  directDateDetector,
  // Information-architecture detectors (cross-file; require ctx.ia).
  missingAgentContextDetector,
  routeMetadataDriftDetector,
  duplicatedNavigationSourceDetector,
  conceptAliasDriftDetector,
  docsCodeDriftDetector,
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
  const detectors = options.detectors ?? builtInDetectors;

  const allFiles = await discoverFiles({
    root,
    include: config.include,
    exclude: config.exclude,
  });

  const files = options.changed
    ? await restrictToChanged({ root, allFiles, base: options.base })
    : allFiles;

  // Build the IA index over the FULL discovered file set, not just the
  // changed slice -- IA findings are cross-file by definition. `--changed`
  // gates only finding emission, not the underlying signal.
  const ia = await safelyBuildIaIndex({ root, allFiles });

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
      });
      findings.push(...detectorFindings);
    }
  }

  const sorted = sortFindings(findings);
  assignIds(sorted);

  return {
    schema_version: SCHEMA_VERSION,
    report_type: "scan",
    repo: {
      name: basename(root),
      root,
    },
    summary: summarise(sorted),
    findings: sorted,
  };
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
}): Promise<IaIndex | undefined> {
  try {
    return await buildIaIndex({ root: args.root, files: args.allFiles });
  } catch {
    return undefined;
  }
}

async function restrictToChanged(args: {
  root: string;
  allFiles: string[];
  base?: string;
}): Promise<string[]> {
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

  const matches: string[] = [];
  for (const abs of allFiles) {
    if (changedReal.has(await safeRealpath(abs))) matches.push(abs);
  }
  return matches;
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
  const failed = report.findings.some((f) =>
    severityAtLeast(f.severity, failOn),
  );
  return { ...report, fail_on: failOn, failed };
}
