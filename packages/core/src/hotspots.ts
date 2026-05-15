import { basename, resolve } from "node:path";
import type { CrimesConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import type { Finding, Severity } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import { collectChurn } from "./git/churn.js";
import { scan } from "./scan.js";

export type HighestSeverity = "none" | Severity;

export interface Hotspot {
  /** Repo-relative path with forward slashes. */
  file: string;
  /** Commits in the window that touched this file. 0 for files with no churn. */
  change_count: number;
  /** ISO timestamp of the most recent commit. Omitted when there is no churn. */
  latest_change?: string;
  /** Number of `crimes scan` findings on this file. */
  finding_count: number;
  /** Worst severity present in `finding_count` — `"none"` when finding_count is 0. */
  highest_severity: HighestSeverity;
  /** Aggregate change-risk score, 0-1. See {@link computeRisk}. */
  risk: number;
}

export interface HotspotsReport {
  schema_version: typeof SCHEMA_VERSION;
  repo: { name: string; root: string };
  /** Echoed `--since` (normalised form not exposed — we keep the user input). */
  since: string;
  /**
   * False when the directory is not a Git repository or `git` is not callable.
   * In that case `change_count` is `0` for every hotspot and `risk` collapses
   * to the severity component only.
   */
  git_available: boolean;
  hotspots: Hotspot[];
}

export interface HotspotsOptions {
  /** Repo root. Defaults to cwd. */
  root?: string;
  /** Git window. Default: "90d". */
  since?: string;
  /** Override config. */
  config?: CrimesConfig;
  /** Override detectors. */
  detectors?: Detector[];
}

const SEVERITY_WEIGHT: Record<HighestSeverity, number> = {
  none: 0,
  low: 0.3,
  medium: 0.6,
  high: 1.0,
};

const SEVERITY_RANK: Record<HighestSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Cap at which churn saturates. Any file with this many commits in the
 * window scores 1.0 on the churn axis.
 */
const CHURN_CAP = 20;

/**
 * Aggregate change-risk score in [0, 1], rounded to 2 decimal places.
 *
 *   risk = 0.6 * churn + 0.4 * severity
 *
 *   churn    = min(change_count / 20, 1)
 *   severity = { none: 0, low: 0.3, medium: 0.6, high: 1.0 }[highest_severity]
 *
 * Deterministic, monotonic in both inputs. No git → churn = 0, so risk
 * degrades cleanly to the severity component only.
 */
export function computeRisk(args: {
  changeCount: number;
  highestSeverity: HighestSeverity;
}): number {
  const churn = Math.min(args.changeCount / CHURN_CAP, 1);
  const severity = SEVERITY_WEIGHT[args.highestSeverity];
  const raw = 0.6 * churn + 0.4 * severity;
  return Math.round(raw * 100) / 100;
}

function highestOf(findings: Finding[]): HighestSeverity {
  let worst: HighestSeverity = "none";
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst]) worst = f.severity;
  }
  return worst;
}

export async function hotspots(
  options: HotspotsOptions = {},
): Promise<HotspotsReport> {
  const root = resolve(options.root ?? process.cwd());
  const config = options.config ?? loadConfig(root);
  const since = options.since ?? "90d";

  const [scanReport, churn] = await Promise.all([
    scan({ root, config, ...(options.detectors ? { detectors: options.detectors } : {}) }),
    collectChurn({ root, since }),
  ]);

  // Findings → per-file aggregates.
  const findingsByFile = new Map<string, Finding[]>();
  for (const f of scanReport.findings) {
    const list = findingsByFile.get(f.file);
    if (list) list.push(f);
    else findingsByFile.set(f.file, [f]);
  }

  // Churn → per-file aggregates.
  const churnByFile = new Map<string, { count: number; latest: string }>();
  for (const c of churn.files) {
    churnByFile.set(c.file, { count: c.changeCount, latest: c.latestChange });
  }

  // Union: any file with either churn or findings becomes a hotspot row.
  const allFiles = new Set<string>([
    ...churnByFile.keys(),
    ...findingsByFile.keys(),
  ]);

  const result: Hotspot[] = [];
  for (const file of allFiles) {
    const findings = findingsByFile.get(file) ?? [];
    const churnInfo = churnByFile.get(file);
    const changeCount = churnInfo?.count ?? 0;
    const highest = highestOf(findings);

    const hotspot: Hotspot = {
      file,
      change_count: changeCount,
      finding_count: findings.length,
      highest_severity: highest,
      risk: computeRisk({ changeCount, highestSeverity: highest }),
    };
    if (churnInfo) hotspot.latest_change = churnInfo.latest;
    result.push(hotspot);
  }

  // Drop rows that contribute no signal at all (no churn, no findings).
  // This only happens when the caller passes a custom union set; with the
  // current logic it's already a no-op, but the filter keeps the contract
  // simple for downstream consumers.
  const filtered = result.filter(
    (h) => h.change_count > 0 || h.finding_count > 0,
  );

  filtered.sort((a, b) => {
    if (b.risk !== a.risk) return b.risk - a.risk;
    if (b.change_count !== a.change_count) return b.change_count - a.change_count;
    if (
      SEVERITY_RANK[b.highest_severity] !== SEVERITY_RANK[a.highest_severity]
    ) {
      return (
        SEVERITY_RANK[b.highest_severity] - SEVERITY_RANK[a.highest_severity]
      );
    }
    return a.file.localeCompare(b.file);
  });

  return {
    schema_version: SCHEMA_VERSION,
    repo: { name: basename(root), root },
    since,
    git_available: churn.gitAvailable,
    hotspots: filtered,
  };
}
