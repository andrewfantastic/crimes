# Using `crimes` with coding agents

`crimes` was designed for AI coding agents (Claude Code, Cursor, Codex, Copilot
Workspace, Aider, OpenAI agents, etc.) operating in unfamiliar codebases. The
`--format json` output is the **stable contract** that agents should consume —
the human-readable report is a rendering of the same underlying findings.

This document covers:

- The recommended pre-edit / post-edit workflow
- How to interpret findings as an agent
- What is guaranteed, what may change, and what is **not** implemented yet

If you are looking for the wire format itself, read
[`docs/json-schema.md`](./json-schema.md). For the catalogue of bundled
agent instructions (root `AGENTS.md`, Claude Code skill), see
[`docs/skills.md`](./skills.md).

---

## Per-agent integration

`crimes` ships with two on-disk artefacts that coding agents pick up
automatically when they open a repo that contains them. You do not need to
copy-paste anything into a prompt — they are loaded by the agent itself.

### Claude Code

A skill lives at [`.claude/skills/crimes/SKILL.md`](../.claude/skills/crimes/SKILL.md).
Claude Code discovers any `SKILL.md` under `.claude/skills/<name>/` and
loads it when the user invokes the matching skill (e.g. `/crimes` or when
Claude judges the skill relevant). The skill is short by design: it tells
Claude *when* to run `crimes`, *which* command to use, and *how* to read
the JSON.

Recommended Claude Code prompt fragments, if the user wants to add a
project-level reminder in `CLAUDE.md`:

> Before editing any file in this repo, run
> `crimes context <file> --format json` and read every `high` severity
> finding. After editing, re-run the same command or
> `crimes scan --changed --format json` and treat any new `high` finding
> as a blocker.

The root [`AGENTS.md`](../AGENTS.md) covers install / build / test /
architecture / safety rules — Claude Code reads `AGENTS.md` as well, so you
get both layers (general agent rules + the on-demand skill).

### Codex CLI (and Codex-style agents)

[`AGENTS.md`](../AGENTS.md) at the repo root is the convention Codex CLI
(and Aider, Cursor, Copilot Workspace, OpenAI agents, etc.) read on
startup. It contains:

- install / build / test commands,
- the four shipped `crimes` commands and their flags,
- project architecture and package boundaries,
- coding style notes,
- agent safety rules (no auto-publish, no shared-branch rewrites, no
  silent auto-fix of findings).

For Codex, the pre-edit / post-edit loop is the same as the rest of this
document — invoke `crimes context <file> --format json` before touching a
file, `crimes scan --changed --format json` after, and diff the findings.

### Other agents (Cursor, Aider, Continue, etc.)

Anything that reads `AGENTS.md` or `CLAUDE.md` will pick up the workflow
without further configuration. For agents that read neither, point them at
this document or copy the [Recommended workflow](#recommended-workflow)
section into your project's agent-rules file.

---

## When to run which command

| Situation                                                       | Command                                          |
| --------------------------------------------------------------- | ------------------------------------------------ |
| About to edit one specific file                                 | `crimes context <file> --format json`            |
| About to refactor across a directory                            | `crimes scan <path> --format json`               |
| Mid-task, want to re-check only the files you have touched      | `crimes scan --changed --format json`            |
| Reviewing a feature branch before merge                         | `crimes scan --changed --base main --format json`|
| Comparing two committed refs (e.g. main vs HEAD)                | `crimes diff main...HEAD --format json`          |
| One-line "did this branch help or hurt?" summary                | `crimes verdict --format json`                   |
| Gating CI on "no new debt vs the saved baseline"                | `crimes baseline check --format json`            |
| Adopting `crimes` on a legacy repo (snapshot, then commit)      | `crimes baseline save`                           |
| Triaging "where in the repo is the most change-risk right now?" | `crimes hotspots --format json`                  |
| Reviewing the whole repo from scratch                           | `crimes scan . --format json --all`              |

If you only learn one command, learn `crimes context <file> --format json`
— it is the cheapest, most file-specific entry point.

---

## Recommended workflow

### 1. Pre-edit context (before touching a single file)

When you are about to edit one specific file, prefer `crimes context` over
a directory scan — it returns the per-file findings, the test files that
look likely to cover it, and short safe-editing notes:

```bash
crimes context path/to/file --format json
```

If you are running against an unreleased checkout, invoke it from this
monorepo as `node packages/cli/dist/index.js context path/to/file --format json`.

The JSON shape is (canonical key order — `agent_guidance` first):

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "context",
  "file": "src/billing.ts",
  "risk": { "level": "high", "high": 1, "medium": 1, "low": 1, "total": 3 },
  "agent_guidance": [
    "Prefer extracting pure helpers before adding more branches.",
    "Avoid adding more direct clock access; inject time where possible."
  ],
  "related_files": [
    {
      "file": "src/nav/sidebar.ts",
      "reason": "related to Route Metadata Drift",
      "score": 0.4
    },
    {
      "file": "src/billing-policy.ts",
      "reason": "shares domain token \"billing\"; matches domain \"billing\"",
      "score": 0.4
    }
  ],
  "likely_tests": ["src/billing.test.ts"],
  "findings": [ /* same Finding shape as scan */ ]
}
```

How to use the fields (read in this order):

- **`risk.level`** is the headline (`none | low | medium | high`) — the worst
  severity present on this file.
- **`agent_guidance`** is one short line per finding type that fired,
  deduped. Read it first — it tells you what *not* to make worse before
  you read anything else. When the file has no findings but does have
  related files, you'll instead see one line pointing you at the
  neighbourhood.
- **`related_files`** is a ranked, capped list (max 10) of other files
  in the repo that an agent should probably read before editing the
  target. Each entry carries a `reason` (`related to <charge>`,
  `shares domain token "<token>"`, `matches domain "<token>"`, or
  `same directory`) and a `score` sort key. Source-of-truth files for
  the same concept usually surface here — the labelled nav source for a
  route, the helper module for an API handler, the sibling pages in
  the same flow. Read these before editing.
- **`likely_tests`** is found by four deterministic conventions:
  same-basename `.test.ts` / `.spec.ts` siblings, Go-style
  `_test.ts` / `_spec.ts` siblings, files under `__tests__/` matching
  the basename, and test files that import the target via a relative
  path. Run these tests after editing.
- **`findings`** are the same Finding objects `crimes scan` would emit,
  filtered to this file. Read every `high` first.

When any of `agent_guidance`, `related_files`, or `likely_tests` is the
empty array, the corresponding `*_reason` field is set to a short
string explaining why (e.g. `"no neighbourhood signal: …"`). Treat
`[]` plus a reason as "we searched and found nothing", not as "we
didn't search".

### 1b. Pre-edit scan (before touching a directory)

When the change spans more than one file, run a scoped scan instead:

```bash
crimes scan path/to/dir --format json
```

What to do with the result:

- **Read every `high` severity finding** in `findings[]` before you write code.
  Each one is concrete evidence that this area is risky to touch.
- **Treat `evidence` as ground truth.** It is generated deterministically from
  the AST or file contents — not from an LLM.
- **Use `lines` + `symbol`** to focus reading on the exact functions or ranges
  the detector flagged, instead of re-reading the whole file.
- **Use `suggested_actions[].kind`** as a hint for the kind of change the
  detector thinks is safe. They are heuristics, not instructions — pick the
  ones that match the user's request.

### 1c. Pre/post-edit on just the changed files

`crimes scan --changed` restricts the scan to files changed in the working
tree (staged, unstaged, and untracked), optionally including everything
that differs between a base ref and `HEAD`. This is the cheapest scope when
you are mid-task and do not need to re-scan an entire directory:

```bash
crimes scan --changed --format json                     # working tree only
crimes scan --changed --base main --format json         # + commits on this branch
crimes scan --changed --base origin/main --format json  # + commits not yet pushed
crimes scan --changed --fail-on high --format json      # CI gate — exit 1 on a new high
```

Semantics:

- With no `--base`, staged, unstaged, and untracked files are all included.
- With `--base <ref>`, the additional set is `<ref>...HEAD` — i.e. commits
  unique to the current branch since it diverged from `<ref>`.
- Deletions are skipped — the file is gone, so there is nothing to scan.
- Non-source files in the changed set (Markdown, JSON, lockfiles, etc.)
  are filtered out via the configured `include` / `exclude` patterns.
- Outside a Git repository the command exits 2 with a clear error on
  stderr; the JSON output is **not** produced. Agents should fall back to
  a path-scoped `crimes scan <path>` when this happens.

The output is the same `ScanReport` shape as `crimes scan` — same
`schema_version`, same finding fields — just over a smaller set of files.

`--fail-on` (CI gate, opt-in):

- Valid **only** in combination with `--changed`. Passing it on a plain
  `crimes scan` exits `2` (usage error).
- Accepts `low | medium | high`. `low` fails on any finding; `medium`
  fails on medium or high; `high` fails on high only.
- When set, the `ScanReport` JSON gains two optional top-level fields:
  `fail_on` (the threshold the run gated on) and `failed` (a boolean
  that flips to `true` when at least one finding in the changed set
  meets the threshold). Both fields are **absent** when `--fail-on`
  isn't passed — `crimes scan --changed` without the flag is unchanged.
- Exit `1` when `failed` is `true`; exit `0` otherwise. The human
  output ends with an `OK:` / `FAILED:` line summarising the gate.

Decision rule for agents: when `failed` is `true` after your edit,
treat it the same as a new high-severity finding in `crimes diff` — fix
or surface the cause before completing the task. See
[`docs/ci.md`](./ci.md) for the CI-side equivalent of this gate.

### 1d. Comparing two committed refs (`crimes diff`)

When you have two committed refs and want the deltas — e.g. reviewing
what a feature branch did vs `main`, or what landed on `main` between
two releases — use `crimes diff`:

```bash
crimes diff main...HEAD --format json
crimes diff origin/main...HEAD --format json
crimes diff v0.1.0...HEAD --format json
```

The range must be the triple-dot form (`<base>...<head>`).

`crimes diff` is **working-tree-safe**: it exports each ref into a fresh
temp directory via `git archive` and scans it there. No checkout, no
stash, no temporary commits — your dirty working tree is preserved.

The JSON shape:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "diff",
  "repo": { "name": "...", "root": "..." },
  "base": "main",
  "head": "HEAD",
  "summary": { "new": 2, "fixed": 1, "unchanged": 8 },
  "new_findings": [ /* same Finding shape as crimes scan */ ],
  "fixed_findings": [ /* ... */ ],
  "unchanged_findings": [ /* ... */ ]
}
```

How to use the fields:

- **`summary.new`** is the headline gate: if it is `> 0` and any of those
  findings are `severity: "high"`, treat the branch as introducing
  regressions and either fix or surface them to the user.
- **`new_findings[]`** carry the full `Finding` shape — quote `evidence`
  and `lines` back when explaining what changed.
- **`fixed_findings[]`** are wins. Mention which charges this branch
  cleared when summarising the work.
- **`unchanged_findings[]`** are pre-existing debt. Don't relitigate
  them in the diff conversation — they were there before the branch.

How findings are matched across the two refs: stable fingerprint
`<type>::<file>::<symbol-or-empty>`, not the per-scan `id`. Small line
shifts from unrelated edits do **not** register as fix + new. See
[`docs/json-schema.md`](./json-schema.md#diffreport-output-of-crimes-diff-basehead)
for the full fingerprint rationale and known limitations (file renames
register as fix + new, identical-name nested helpers collide on one
fingerprint).

Decision rule, same as the rest of the workflow: a new `severity:
"high"` finding in `new_findings` is a blocker unless the user
explicitly accepts the risk.

### 1e. Gating CI on the saved baseline (`crimes baseline`)

When the repo has a committed `.crimes/baseline.json`, the agent loop can
run the same gate CI uses:

```bash
crimes baseline check --format json
crimes baseline check --fail-on high --format json   # stricter gate
```

`crimes baseline save` writes the snapshot; `crimes baseline check`
compares the current scan to that snapshot and fails on findings absent
from the baseline. Adoption flow:

```bash
crimes baseline save               # one-time per repo
git add .crimes/baseline.json
git commit -m "Add crimes baseline"
# … later, on every PR …
crimes baseline check
```

The JSON shape:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "baseline_check",
  "repo": { "name": "...", "root": "..." },
  "baseline_path": "/abs/path/to/.crimes/baseline.json",
  "fail_on": "medium",
  "failed": false,
  "summary": {
    "total_baseline": 5, "total_current": 5,
    "new": 0, "fixed": 0, "unchanged": 5,
    "new_by_severity": { "high": 0, "medium": 0, "low": 0 }
  },
  "new_findings": [ /* same Finding shape as crimes scan */ ],
  "fixed_findings": [ /* BaselineEntry — fingerprint + identity fields */ ],
  "unchanged_findings": [ /* same Finding shape as crimes scan */ ]
}
```

How to use the fields:

- **`failed`** is the gate. `true` → at least one new finding meets the
  `--fail-on` threshold; exit `1`. `false` → exit `0`.
- **`new_findings[]`** carry the full `Finding` shape. Quote `evidence`
  and `lines` when explaining what's new vs the baseline.
- **`fixed_findings[]`** are `BaselineEntry` records (fingerprint + type
  + charge + severity + file + symbol). Mention which charges this
  branch retired. The minimal shape is intentional — once a finding is
  fixed, its old `lines` / `evidence` no longer make sense.
- **`unchanged_findings[]`** are the legacy debt the baseline pins.
  Don't relitigate them in the conversation — they were already
  accepted when the baseline was committed.

`--fail-on` thresholds:

| Value      | A new finding fails when its severity is …       |
| ---------- | ------------------------------------------------ |
| `"low"`    | low, medium, or high                             |
| `"medium"` | medium or high _(default)_                       |
| `"high"`   | high only                                        |

Exit codes:

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | No new findings at or above `--fail-on`.                                      |
| `1`  | At least one new finding at or above `--fail-on` — blocking.                  |
| `2`  | Missing or malformed `.crimes/baseline.json`, or a bad flag.                  |

Findings are matched by the same stable fingerprint
`<type>::<file>::<symbol-or-empty>` as `crimes diff` — small line shifts
don't register as fix + new. See
[`docs/json-schema.md`](./json-schema.md#baseline-on-disk-shape-of-crimesbaselinejson)
for the full schema and known limitations.

### 1f. Branch-level verdict (`crimes verdict`)

When the agent finishes a task and wants a one-line "did this branch
help or hurt the repo?" answer, run `crimes verdict`. It is built on top
of `crimes diff`, so it inherits the same fingerprint matching and
working-tree-safety, but emits a single headline `verdict` instead of
the full new/fixed/unchanged breakdown:

```bash
crimes verdict --format json                  # default base: origin/main → main
crimes verdict --base main --format json      # override base
crimes verdict --fail-on new-high             # opt-in CI gate (exit 1)
```

Default base selection: `origin/main` first, then `main`. If neither
resolves the command exits `2` with a "no default base" error on
stderr; pass `--base <ref>` explicitly.

The JSON shape:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "verdict",
  "repo": { "name": "...", "root": "..." },
  "base": "origin/main",
  "head": "HEAD",
  "verdict": "worse",
  "summary": {
    "new": 2, "fixed": 1, "unchanged": 8,
    "new_by_severity":   { "high": 1, "medium": 1, "low": 0 },
    "fixed_by_severity": { "high": 0, "medium": 1, "low": 0 },
    "new_weighted": 5,
    "fixed_weighted": 2
  },
  "reasons": ["introduced 1 high-severity crime"],
  "recommended_actions": ["fix new high-severity findings before merging."],
  "new_findings":   [ /* same Finding shape as crimes scan */ ],
  "fixed_findings": [ /* ... */ ]
}
```

How to use the fields:

- **`verdict`** is the headline: one of `"cleaner" | "worse" | "unchanged"
  | "mixed"`. Read this first.
- **`reasons`** is a short array of human-readable strings explaining
  what drove the verdict. Quote them back to the user when summarising.
- **`recommended_actions`** is one or two lines suggesting next steps.
  Treat both `reasons` and `recommended_actions` as advisory copy —
  wording may shift across minor releases.
- **`summary.new_weighted` / `summary.fixed_weighted`** are the simple
  weighted scores (`high = 3`, `medium = 2`, `low = 1`) that drive the
  judgement. Treat as ordinal — exact weights may change.
- **`summary.new_by_severity` / `summary.fixed_by_severity`** are the
  per-severity counts on each side, useful when explaining the trade-off.
- **`new_findings[]` / `fixed_findings[]`** carry the full `Finding`
  shape — same contract as `crimes diff`. Quote `evidence` and `lines`
  when explaining what changed.

Judgement rules, in order:

1. **`unchanged`** — no new and no fixed findings.
2. **`worse`** — any new finding has `severity: "high"`.
3. **`worse`** — `new_weighted > fixed_weighted` (no new high required).
4. **`cleaner`** — `fixed_weighted > new_weighted` AND no new high.
5. **`mixed`** — both sides non-zero with equal weighted scores.

Exit codes:

| `--fail-on`    | Exit `1` when …                                                  |
| -------------- | ---------------------------------------------------------------- |
| _(omitted)_    | Never — `crimes verdict` is advisory by default.                 |
| `worse`        | `verdict === "worse"`.                                           |
| `new-high`     | Any new finding has `severity: "high"`.                          |
| `new-medium`   | Any new finding has `severity: "medium"` or `"high"`.            |

Exit `2` is reserved for usage / environment errors (not a git repo, no
default base resolves, bad flag).

Decision rule: when `verdict === "worse"` because of a new high
finding, the agent should treat that as a blocker — same rule as the
rest of this document. When the verdict is `mixed`, surface the
trade-off rather than silently merging.

### 2. Make the edit

Apply your change. `crimes` does not run during editing; it has no LSP and no
watch mode.

### 3. Post-edit scan (after writing the change)

Re-run the same scan and **diff the findings against the pre-edit run**:

```bash
crimes scan path/to/file-or-dir --format json
```

Decision rule:

- If your edit introduced a **new `severity: "high"` finding**, treat it as a
  blocker — either fix it before continuing, or surface it to the user with a
  short justification ("I'm leaving this God Function because the user asked
  for the smallest possible diff").
- If `agent_risk` increased on a touched file, slow down: you may have added
  a hidden source of truth, a duplicate rule, or a misleading name.
- If the total counts in `summary` went down, you are in a good state.

This pre/post pattern is the single highest-leverage way to use `crimes` from
inside an agent loop. It catches the class of regressions that linters do not
see: code that compiles, passes tests, and still makes the repo harder to
change next time.

### 4. Communicate trade-offs explicitly

If you are leaving findings in the code on purpose, **say so in your PR
description or chat reply**, citing the finding `id` and `charge`. Do not
silently suppress findings.

Good:

> Leaving `crime_00001` (God Function on `generateInvoice`) as-is for this
> change — splitting it is out of scope for the bugfix you asked for.

Bad:

> Done.

---

## Information architecture findings

`crimes@0.3.0` adds five **information architecture** detectors that
look for ambiguous sources of truth across the repo:

| `Finding.type`                  | Charge                       | Reads                                                                                  |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `missing_agent_context`         | Missing Agent Context        | `AGENTS.md` / `CLAUDE.md` / `.claude/skills/*/SKILL.md` + `package.json` `bin`         |
| `route_metadata_drift`          | Route Metadata Drift         | Route file paths, default exports, `<title>` / `metadata.title`, and nav-source labels |
| `duplicated_navigation_source`  | Duplicated Navigation Source | Top-level nav-array literals across files                                              |
| `concept_alias_drift`           | Concept Alias Drift          | Path tokens, route paths, labels, nav entries, and doc headings                        |
| `docs_code_drift`               | Docs-Code Drift              | Local links in `docs/**/*.md` and root-level `*.md`                                    |

IA findings are **cross-file by design**. The `file` field anchors the
finding on the most useful single path (the route file, the
lexicographically first nav source, the alias-group anchor, the doc),
and `related_files` lists the other repo-relative paths that
contributed evidence. Treat `related_files` as "also read these before
editing" — same scope as the finding itself. The human reporter renders
those paths as an "Also touches:" block under each finding (capped at 5
with the rest summarised), so a grep-friendly run still surfaces every
file an agent needs to read.

**Why this matters for agents.** Without IA findings, an agent asked
to "rename the billing page" or "update the team copy" picks the file
it greps first and leaves every other source of truth stale. IA
findings make that ambiguity visible **before** the edit — every
`related_files` entry is a place where the same concept lives under a
different label, in a different file, with a different vocabulary.
Read them before choosing which one is canonical.

Each `agent_guidance` line is keyed on `Finding.type`:

| Type                            | Guidance                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `missing_agent_context`         | Agents may miss project-specific commands, architecture rules, and safety checks.                          |
| `route_metadata_drift`          | The route path, title, breadcrumb, and component name appear to disagree — verify each before changing labels. |
| `duplicated_navigation_source`  | Multiple files declare this destination; updating only one will leave the others stale.                    |
| `concept_alias_drift`           | Other files describe this concept under a different name; read them before renaming or extending.          |
| `docs_code_drift`               | Docs reference local files that no longer exist — update the docs in the same PR.                          |

**Key contract.** IA findings are **ambiguity signals**, not claims of
semantic truth. The detector phrases its summary as "appears to" /
"may" / "looks like" — and so should you when relaying a finding to a
user. Every evidence string is concrete (file path, line, literal
value); the *interpretation* of that evidence belongs to the human or
agent reading the report.

**No LLM, no API key, no network access** is required to produce these
findings. Every IA detector runs as a deterministic AST + markdown
pass. Two runs over the same repo produce identical IA findings.

For long-form per-detector reference (false-positive notes, quorum
rules, suggested fixes), see
[`docs/finding-types/ia.md`](./finding-types/ia.md).

---

## How to read a finding

Every finding has the same shape (see [`json-schema.md`](./json-schema.md) for
the full type). The five fields that matter most to an agent are:

| Field              | What it tells you                                                                  |
| ------------------ | ---------------------------------------------------------------------------------- |
| `severity`         | `"high" \| "medium" \| "low"` — the headline triage signal                         |
| `file` + `lines`   | Where the smell lives. `lines` is `[start, end]`, inclusive, 1-based               |
| `symbol`           | The function or method name when applicable (e.g. for `large_function` findings)    |
| `evidence`         | Concrete facts the detector observed — quote these back when explaining changes     |
| `scores.agent_risk`| `0–1`. Higher means easier for an LLM to misread, duplicate, or break this area    |

`severity` is for triage. `scores.agent_risk` is the more interesting signal
for an agent: it stays high even when the local severity is low, when the
area is structurally confusing (multiple sources of truth, weak tests, hidden
side effects, etc.).

Default sort order is severity-first (`high → medium → low`), then confidence,
then file path, then line number. You can re-sort by `scores.agent_risk` if
your goal is "what should I read before editing", rather than "what is most
broken".

---

## Concrete example

This is the actual current output of `pnpm scan:example:json` against
[`examples/messy-ts-app`](../examples/messy-ts-app), with the absolute repo
path sanitised:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "scan",
  "repo": {
    "name": "messy-ts-app",
    "root": "/path/to/crimes/examples/messy-ts-app"
  },
  "summary": { "total": 5, "high": 1, "medium": 3, "low": 1 },
  "findings": [
    {
      "id": "crime_00001",
      "type": "large_function",
      "charge": "God Function",
      "severity": "high",
      "confidence": 0.95,
      "file": "src/billing.ts",
      "symbol": "generateInvoice",
      "lines": [37, 240],
      "summary": "generateInvoice spans 204 lines — past the 60-line threshold for a single function. Bodies this size usually mix unrelated responsibilities, and an agent editing one section often misses interactions in another.",
      "evidence": [
        "lines 37–240 (204 lines)",
        "3.4× the configured 60-line threshold",
        "function declaration"
      ],
      "scores": { "severity": 0.9, "confidence": 0.95, "agent_risk": 0.95 },
      "suggested_actions": [
        {
          "kind": "extract_function",
          "description": "Extract cohesive sections into named helpers so each responsibility can be read, tested, and edited in isolation.",
          "risk": "low"
        }
      ]
    }
    // ...four more findings elided. Full output:
    //   docs/fixtures/messy-ts-app.json
  ]
}
```

Full file: [`docs/fixtures/messy-ts-app.json`](./fixtures/messy-ts-app.json).

---

## What is and isn't shipped today

The brief above describes the workflow `crimes` is built around. Some of the
commands the PRD calls out are **not yet implemented**, and you should not
rely on them in agent instructions yet:

| Command                                | Status                  |
| -------------------------------------- | ----------------------- |
| `crimes scan [path]`                   | ✅ shipped              |
| `crimes scan [path] --format json`     | ✅ shipped              |
| `crimes scan --all`                    | ✅ shipped              |
| `crimes scan --no-color`               | ✅ shipped              |
| `crimes scan --changed`                | ✅ shipped              |
| `crimes scan --changed --base <ref>`   | ✅ shipped              |
| `crimes scan --changed --fail-on <severity>` | ✅ shipped (`0.2.0`) |
| `crimes context <file>`                | ✅ shipped              |
| `crimes context <file> --format json`  | ✅ shipped              |
| `crimes hotspots [path]`               | ✅ shipped              |
| `crimes hotspots [path] --since <window>` | ✅ shipped           |
| `crimes hotspots [path] --format json` | ✅ shipped              |
| `crimes diff <base...head>`            | ✅ shipped (`0.2.0`)    |
| `crimes diff <base...head> --format json` | ✅ shipped (`0.2.0`) |
| `crimes baseline save [path]`          | ✅ shipped (`0.2.0`)    |
| `crimes baseline check [path]`         | ✅ shipped (`0.2.0`)    |
| `crimes baseline check --fail-on <severity>` | ✅ shipped (`0.2.0`) |
| `crimes baseline check --format json`  | ✅ shipped (`0.2.0`)    |
| `crimes verdict`                       | ✅ shipped (`0.2.0`)    |
| `crimes verdict --base <ref>`          | ✅ shipped (`0.2.0`)    |
| `crimes verdict --format json`         | ✅ shipped (`0.2.0`)    |
| `crimes verdict --fail-on <threshold>` | ✅ shipped (`0.2.0`)    |
| IA findings: `missing_agent_context`, `route_metadata_drift`, `duplicated_navigation_source`, `concept_alias_drift`, `docs_code_drift` | ✅ shipped (`0.3.0`) |
| `Finding.related_files` populated on IA findings (human-rendered as "Also touches:") | ✅ shipped (`0.3.0`) |
| `crimes diff --fail-on new-high`       | 🚧 deferred (v0.4.0 candidate) |
| `crimes ignore <id>`                   | 🚧 deferred (v0.4.0 candidate) |
| `crimes explain <id>`                  | 🚧 deferred (v0.4.0 candidate) |
| `crimes init`                          | 🚧 deferred (v0.4.0 candidate) |
| `crimes ask` / LLM-assisted modes      | 🚧 deferred to `v1+`    |

Until the deferred items land, the pre/post-edit workflow works as
plain `crimes scan <path> --format json` on the directory or file you
are about to touch, `crimes diff <base...head>` for branch-level
review, and `crimes verdict` for the one-line "did this branch help or
hurt?" summary at the end of a task. For a hard CI gate, use any of
`crimes scan --changed --fail-on`, `crimes baseline check --fail-on`,
or `crimes verdict --fail-on` — see [`docs/ci.md`](./ci.md).

---

## Stability and schema versioning

- `schema_version` at the top of the report is the source of truth. While
  `schema_version === "0.1.0"`, the shape documented in
  [`json-schema.md`](./json-schema.md) is stable.
- Optional score fields (`scores.blast_radius`, `scores.churn`,
  `scores.test_gap`) are **reserved** — they are documented in the
  schema but only populated when later milestones add the underlying
  signals (git history, cross-file analysis). Treat their absence as
  "not computed", not "zero".
- `related_files` is populated by the IA detectors (since `0.3.0`).
  Treat its absence on a structural finding as "no cross-file context
  for this finding".
- Breaking changes to the wire format will bump `schema_version`. Agents
  should refuse to consume output whose `schema_version` they don't know.

---

## Exit codes

Default `crimes scan` is **advisory** — it always exits `0`, regardless of
findings. The same goes for `crimes diff`, `crimes context`, `crimes
hotspots`, and `crimes verdict` (without `--fail-on`).

Three commands have an opt-in **gating** mode:

| Command                                                          | Exit `1` when …                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `crimes scan --changed --fail-on low\|medium\|high`              | A finding in the changed set meets the severity threshold.                       |
| `crimes baseline check --fail-on low\|medium\|high` (default `medium`) | A **new** finding (vs the saved baseline) meets the severity threshold.    |
| `crimes verdict --fail-on worse\|new-high\|new-medium`           | The configured verdict / severity threshold is hit.                              |

All three share the same exit-code contract:

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | Command succeeded; no blocking findings under the configured `--fail-on`.     |
| `1`  | Blocking findings present — the CI gate.                                      |
| `2`  | Usage / environment error — bad flag, missing baseline, not a git repo, etc.  |

`0` and `1` always emit JSON on stdout when `--format json` is set. `2`
writes a human-readable error to stderr and emits no JSON, so consumers
can distinguish "gate failed" from "command broke" without parsing.

If you want to gate on a command that doesn't have `--fail-on` (e.g.
`crimes diff` today, or plain `crimes scan`), gate on the JSON yourself:

```bash
crimes scan . --format json \
  | jq -e '.summary.high == 0' >/dev/null
```

See [`docs/ci.md`](./ci.md) for the CI-side recipes built on these
exit codes.
