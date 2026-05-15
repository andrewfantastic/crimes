import { readFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { discoverFiles, parseFile } from "@crimes/language-js";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { directDateDetector } from "./detectors/direct-date.js";
import { largeFileDetector } from "./detectors/large-file.js";
import { largeFunctionDetector } from "./detectors/large-function.js";
import { todoDensityDetector } from "./detectors/todo-density.js";
import type { Finding, ScanReport, ScanSummary } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";

export const builtInDetectors: Detector[] = [
  largeFileDetector,
  largeFunctionDetector,
  todoDensityDetector,
  directDateDetector,
];

export interface ScanOptions {
  /** Absolute or relative path to scan. Defaults to cwd. */
  root?: string;
  /** Override config explicitly. */
  config?: CrimesConfig;
  /** Override detectors. Defaults to all built-ins. */
  detectors?: Detector[];
}

export async function scan(options: ScanOptions = {}): Promise<ScanReport> {
  const root = resolve(options.root ?? process.cwd());
  const config = options.config ?? loadConfig(root);
  const detectors = options.detectors ?? builtInDetectors;

  const files = await discoverFiles({
    root,
    include: config.include,
    exclude: config.exclude,
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
      });
      findings.push(...detectorFindings);
    }
  }

  const sorted = sortFindings(findings);
  assignIds(sorted);

  return {
    schema_version: SCHEMA_VERSION,
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
