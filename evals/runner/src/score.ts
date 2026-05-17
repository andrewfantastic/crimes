import { builtInDetectors } from "@crimes/core";
import type { ExpectedArtifacts, ScoreDetail } from "./types.js";

/**
 * Set of every known detector id at runtime. Built from @crimes/core's
 * exported list so we don't have to mirror it. Used to scan agent
 * responses for detector-id mentions when applying the structural
 * rubric.
 */
const DETECTOR_IDS: ReadonlySet<string> = new Set(
  builtInDetectors.map((d) => d.id),
);

export interface StructuralScoreResult {
  passed: number;
  failed: number;
  details: ScoreDetail[];
}

/**
 * Apply the structural rubric (per §5.5 of the calibration plan) to an
 * agent's response. Deterministic, cheap — runs on every CI replay.
 *
 * Each `expected_artifacts` field becomes one check:
 *
 * - `referenced_findings`: scan the response for known detector-id
 *   strings; one match per expected id is a pass.
 * - `referenced_files`: regex-scan for file-path-shaped strings; one
 *   match per expected path is a pass.
 * - `forbidden_actions`: pass if NONE of the listed regex patterns
 *   appear; one fail tips the whole check.
 * - `expected_priority`: parse the first 200 chars for the leading
 *   detector-id; pass if it matches the expectation.
 */
export function scoreStructural(
  response: string,
  expected: ExpectedArtifacts,
): StructuralScoreResult {
  const details: ScoreDetail[] = [];

  if (expected.referenced_findings && expected.referenced_findings.length > 0) {
    const matchedDetectors = extractDetectorIds(response);
    for (const expectedId of expected.referenced_findings) {
      const passed = matchedDetectors.has(expectedId);
      details.push({
        check: "referenced_findings",
        expected: expectedId,
        observed: passed ? expectedId : null,
        passed,
      });
    }
  }

  if (expected.referenced_files && expected.referenced_files.length > 0) {
    const matchedFiles = extractFilePaths(response);
    for (const expectedFile of expected.referenced_files) {
      const passed = matchedFiles.has(expectedFile);
      details.push({
        check: "referenced_files",
        expected: expectedFile,
        observed: passed ? expectedFile : null,
        passed,
      });
    }
  }

  if (expected.forbidden_actions && expected.forbidden_actions.length > 0) {
    let allClean = true;
    const triggered: string[] = [];
    for (const pattern of expected.forbidden_actions) {
      if (new RegExp(pattern, "i").test(response)) {
        allClean = false;
        triggered.push(pattern);
      }
    }
    details.push({
      check: "forbidden_actions",
      expected: expected.forbidden_actions,
      observed: triggered,
      passed: allClean,
    });
  }

  if (expected.expected_priority !== undefined) {
    const priority = extractLeadingDetectorId(response);
    const passed = priority === expected.expected_priority;
    details.push({
      check: "expected_priority",
      expected: expected.expected_priority,
      observed: priority,
      passed,
    });
  }

  const passed = details.filter((d) => d.passed).length;
  const failed = details.length - passed;
  return { passed, failed, details };
}

/**
 * Find every known-detector-id token in `response`. Boundary check
 * uses `\b` so a partial match (`large_function_extra`) doesn't pass.
 */
function extractDetectorIds(response: string): Set<string> {
  const found = new Set<string>();
  for (const id of DETECTOR_IDS) {
    if (new RegExp(`\\b${escapeRegex(id)}\\b`).test(response)) {
      found.add(id);
    }
  }
  return found;
}

/**
 * Find file-path-shaped tokens (anything containing `/` plus a recognised
 * source/text extension). Conservative — only counts paths that look like
 * actual source files an agent would name.
 */
function extractFilePaths(response: string): Set<string> {
  const found = new Set<string>();
  const re = /[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|css|scss|html)\b/g;
  const matches = response.matchAll(re);
  for (const m of matches) found.add(m[0]);
  return found;
}

/**
 * Parse the first 200 characters of `response` and return the FIRST
 * detector id that appears (in source order). Used by the
 * `expected_priority` check.
 */
function extractLeadingDetectorId(response: string): string | null {
  const head = response.slice(0, 200);
  let earliest: { id: string; index: number } | null = null;
  for (const id of DETECTOR_IDS) {
    const idx = head.search(new RegExp(`\\b${escapeRegex(id)}\\b`));
    if (idx === -1) continue;
    if (!earliest || idx < earliest.index) {
      earliest = { id, index: idx };
    }
  }
  return earliest ? earliest.id : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
