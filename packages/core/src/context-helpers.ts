import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ContextRelatedFile } from "./context-related-files.js";
import type { Finding, Severity } from "./finding.js";
import type { ContextRisk } from "./context.js";

/**
 * Per-finding-type guidance shown to agents in the human report and in
 * `agent_guidance`. Keep short and behavioural — not "fix this", but
 * "don't make it worse" before the agent edits.
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

/**
 * Guidance line emitted when a file has no findings but does have
 * deterministic related files. Keeps the "Agent guidance" block
 * non-empty in the common neighbourhood-only case (an agent landed on a
 * clean route file, but other files clearly share its domain).
 */
const NEIGHBOURHOOD_GUIDANCE =
  "Review related files before editing — they share domain tokens or route/navigation evidence with this target.";

export function buildRisk(findings: Finding[]): ContextRisk {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;
  let level: ContextRisk["level"] = "none";
  if (counts.high > 0) level = "high";
  else if (counts.medium > 0) level = "medium";
  else if (counts.low > 0) level = "low";
  return {
    level,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
    total: findings.length,
  };
}

export function buildGuidance(
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

export function toRepoRelative(root: string, file: string): string {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  return toRepoPath(relative(root, abs));
}

export function toRepoPath(p: string): string {
  return p.split(sep).join("/");
}

export function sortFindings(findings: Finding[]): void {
  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => {
    const sev = order[a.severity] - order[b.severity];
    if (sev !== 0) return sev;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.lines?.[0] ?? 0) - (b.lines?.[0] ?? 0);
  });
}

export function assignIds(findings: Finding[]): void {
  findings.forEach((f, i) => {
    f.id = `crime_${String(i + 1).padStart(5, "0")}`;
  });
}
