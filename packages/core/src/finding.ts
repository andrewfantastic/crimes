/**
 * Public finding schema. This is part of the product API contract.
 *
 * Bumping `schema_version` is a breaking change.
 */
export const SCHEMA_VERSION = "0.1.0" as const;

export type Severity = "low" | "medium" | "high";

export interface FindingScores {
  /** How bad the smell is in isolation (0-1). */
  severity: number;
  /** How certain the detector is (0-1). */
  confidence: number;
  /** Estimated blast radius across the repo (0-1). 0 when unknown. */
  blast_radius?: number;
  /** Git churn signal (0-1). 0 when unknown. */
  churn?: number;
  /** Test gap signal (0-1). 0 when unknown. */
  test_gap?: number;
  /** How likely an AI agent is to misread/damage this area (0-1). */
  agent_risk?: number;
}

export interface SuggestedAction {
  kind: string;
  description: string;
  risk: "low" | "medium" | "high";
}

export interface Finding {
  /** Stable per-scan id, e.g. `crime_01982`. */
  id: string;
  /** Machine-readable type, e.g. `large_function`. */
  type: string;
  /** Human-readable charge, e.g. `God Function`. */
  charge: string;
  severity: Severity;
  /** 0-1 confidence. */
  confidence: number;
  /** Repo-relative file path with forward slashes. */
  file: string;
  /** Optional symbol name (function/class). */
  symbol?: string;
  /** Inclusive [start, end] 1-based line range. */
  lines?: [number, number];
  /** One-line summary. */
  summary: string;
  /** Concrete evidence — short factual strings. */
  evidence: string[];
  scores: FindingScores;
  suggested_actions?: SuggestedAction[];
  related_files?: string[];
}

export interface ScanSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface ScanReport {
  schema_version: typeof SCHEMA_VERSION;
  repo: {
    name: string;
    root: string;
    git_ref?: string;
  };
  summary: ScanSummary;
  findings: Finding[];
  /**
   * Severity threshold the CLI gated on. Only set when the user passed
   * `--changed --fail-on <severity>` to `crimes scan`. Absent otherwise.
   */
  fail_on?: Severity;
  /**
   * True when at least one finding in `findings` has severity ≥ `fail_on`.
   * Only set when `fail_on` is set. Drives the non-zero exit on the gate.
   */
  failed?: boolean;
}
