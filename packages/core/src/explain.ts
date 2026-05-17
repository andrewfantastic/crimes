import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import type { Detector } from "./detector.js";
import { fingerprintFinding } from "./fingerprint.js";
import type { Finding, ScanReport } from "./finding.js";
import { SCHEMA_VERSION } from "./finding.js";
import {
  applySuppressionsToScan,
  builtInDetectors,
  filterDetectors,
  scan,
} from "./scan.js";
import { loadSuppressionsForRoot } from "./suppressions.js";

/**
 * Deterministic, evidence-backed long-form rationale for one finding.
 * Produced by {@link explain}. The schema additions are documented in
 * `docs/json-schema.md`.
 */
export interface ExplainReport {
  schema_version: typeof SCHEMA_VERSION;
  report_type: "explain";
  finding: Finding;
  detector: {
    type: string;
    charge: string;
    description: string;
  };
  why_it_matters: string;
  suggested_suppression_command: string;
}

export interface ExplainOptions {
  /** Absolute or relative path to the repo. Defaults to cwd. */
  root?: string;
  /**
   * Pre-loaded scan report — when set, `explain()` looks up the finding in
   * here instead of running a fresh scan. Mirrors the `--from <scan.json>`
   * CLI flag.
   */
  from?: ScanReport;
  /** Override detector set used during fresh scans. */
  detectors?: Detector[];
}

export class UnknownFindingError extends Error {
  identifier: string;
  constructor(identifier: string) {
    super(
      `no finding with id or fingerprint "${identifier}" — re-run ` +
        "`crimes scan` and check the output.",
    );
    this.name = "UnknownFindingError";
    this.identifier = identifier;
  }
}

export class UnknownDetectorTypeError extends Error {
  type: string;
  constructor(type: string) {
    super(`no detector registered for finding.type "${type}".`);
    this.name = "UnknownDetectorTypeError";
    this.type = type;
  }
}

const ID_PATTERN = /^crime_\d+$/;

/**
 * Resolve a finding by id or fingerprint and produce its explanation.
 *
 * Identifier formats accepted:
 * - per-scan id (`crime_00005`) — only meaningful when paired with the
 *   same scan that produced it, so `options.from` is the canonical path
 *   here; fresh-scan mode also works as long as the order is stable.
 * - stable fingerprint (`<type>::<file>::<symbol>`) — survives across
 *   scans; the preferred form for agent workflows.
 */
export async function explain(
  identifier: string,
  options: ExplainOptions = {},
): Promise<ExplainReport> {
  const root = resolve(options.root ?? process.cwd());

  let findings: Finding[];
  if (options.from) {
    findings = options.from.findings;
  } else {
    const config = loadConfig(root);
    const detectors = options.detectors ?? filterDetectors(builtInDetectors, config);
    let report = await scan({ root, config, detectors });
    const suppressions = loadSuppressionsForRoot(root, config);
    // Run with showSuppressed=true so a suppressed finding can still be
    // looked up by id/fingerprint — `crimes explain` is the right place
    // to read about a finding the team has already chosen to live with.
    report = applySuppressionsToScan(report, suppressions.entries, {
      showSuppressed: true,
    });
    findings = report.findings;
  }

  const match = findFinding(findings, identifier);
  if (!match) throw new UnknownFindingError(identifier);

  const detector = builtInDetectors.find((d) => d.id === match.type);
  if (!detector) throw new UnknownDetectorTypeError(match.type);

  const fingerprint = fingerprintFinding(match);

  return {
    schema_version: SCHEMA_VERSION,
    report_type: "explain",
    finding: match,
    detector: {
      type: detector.id,
      charge: match.charge,
      description: detector.description,
    },
    why_it_matters: detector.whyItMatters,
    suggested_suppression_command:
      `crimes ignore ${fingerprint} ` +
      `--reason "<one-sentence justification>"`,
  };
}

function findFinding(findings: Finding[], identifier: string): Finding | undefined {
  if (ID_PATTERN.test(identifier)) {
    return findings.find((f) => f.id === identifier);
  }
  return findings.find((f) => fingerprintFinding(f) === identifier);
}
