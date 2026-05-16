import type { Detector, DetectorContext } from "../detector.js";
import type { Finding } from "../finding.js";

/**
 * Fires when the repo ships no agent-readable instructions at all -- no
 * AGENTS.md, no CLAUDE.md, no .claude/skills/*\/SKILL.md.
 *
 * IA detectors are emitted by `scan` once per repo, not once per file. To
 * achieve that with the existing per-file detector loop, we fire only when
 * `ctx.file` is the lexicographically first source file in the IA index --
 * a deterministic, repo-stable anchor.
 */
export const missingAgentContextDetector: Detector = {
  id: "missing_agent_context",
  name: "Missing Agent Context",
  description:
    "Flags repos that ship no agent-readable instruction files. Agents may " +
    "miss project conventions, commands, and safety checks when they have " +
    "nothing to load.",

  run(ctx) {
    if (!ctx.ia) return [];
    const anchor = primaryAnchor(ctx);
    if (anchor !== ctx.file) return [];

    const { agentsMdPath, claudeMdPath, claudeSkills, declaredBins } =
      ctx.ia.agentContext;

    const hasAny =
      agentsMdPath !== undefined ||
      claudeMdPath !== undefined ||
      claudeSkills.length > 0;
    if (hasAny) return [];

    // Only fire when there is a clear "this repo is meant to be used by
    // agents" signal -- a published bin. Libraries, internal packages, and
    // tiny test fixtures without a bin produce too many false positives
    // otherwise. The plan calls out per-package bin support as future work.
    if (declaredBins.length === 0) return [];

    const evidence: string[] = [
      "no AGENTS.md found at repo root",
      "no CLAUDE.md found at repo root",
      "no .claude/skills/*/SKILL.md present",
      `package.json declares bin(s): ${declaredBins.join(", ")} — agents have no way to discover commands`,
    ];

    // Anchor the finding on the lex-first source file -- the finding's
    // subject is the absence of AGENTS.md, but pointing `file` at a missing
    // path would break `crimes hotspots` (which aggregates by file) and
    // `crimes context` (which expects `file` to exist on disk).
    const finding: Finding = {
      id: "",
      type: "missing_agent_context",
      charge: "Missing Agent Context",
      severity: "medium",
      confidence: 0.9,
      file: anchor,
      summary:
        "Repo ships no agent-readable instruction files (AGENTS.md, " +
        "CLAUDE.md, .claude/skills/*/SKILL.md). Agents loading this repo " +
        "will not see project commands, conventions, or safety rules and " +
        "are more likely to make confident-but-wrong edits.",
      evidence,
      scores: {
        severity: 0.6,
        confidence: 0.9,
        agent_risk: 0.8,
      },
      suggested_actions: [
        {
          kind: "add_agent_context",
          description:
            "Add AGENTS.md or a Claude skill so coding agents can discover " +
            "repo conventions before editing.",
          risk: "low",
        },
      ],
    };

    return [finding];
  },
};

/**
 * Returns the lexicographically first source file tracked in the IA index,
 * or `undefined` when the index has no files. IA detectors that need to
 * fire once per scan compare against this to choose a deterministic
 * emission point in the per-file detector loop.
 */
function primaryAnchor(ctx: DetectorContext): string | undefined {
  if (!ctx.ia) return undefined;
  const files = Object.keys(ctx.ia.files).sort();
  return files[0];
}
