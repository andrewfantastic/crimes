# crimes

> A crime scene investigator for your codebase. **Built for agents, readable by humans.**

[![npm version](https://img.shields.io/npm/v/crimes.svg)](https://www.npmjs.com/package/crimes)
[![license](https://img.shields.io/npm/l/crimes.svg)](./LICENSE)
[![CI](https://github.com/andrewfantastic/crimes/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewfantastic/crimes/actions/workflows/ci.yml)

`crimes` is an open-source CLI that scans a repository for maintainability
risks, code smells, duplicated business rules, weak test boundaries, and
patterns that confuse AI coding agents.

It is **not** another linter. Linters catch local syntax and style issues.
`crimes` answers a higher-value question:

> _Where in this repo is future change most likely to go wrong, and what
> should a human or coding agent know before editing it?_

- Website: **[crimes.sh](https://crimes.sh)**
- npm: **[`crimes`](https://www.npmjs.com/package/crimes)**
- Repo: **[`andrewfantastic/crimes`](https://github.com/andrewfantastic/crimes)**

This README has a first-time-CLI-user path near the top and a “for agents”
section near the bottom. Pick whichever you are.

---

## Install

`crimes` is published on npm and requires **Node.js ≥ 18**.

```bash
# Global install
npm install -g crimes
crimes scan .

# Or one-shot via npx
npx crimes scan .
```

`pnpm dlx crimes scan` and `bunx crimes scan` also work.

---

## Quick start

```bash
# Scan the current directory (top 10 findings)
crimes scan .

# Stable JSON output — the product contract
crimes scan . --format json

# Show every finding, not just the top 10
crimes scan . --all

# Pre-edit briefing for one file (findings + likely tests + agent notes)
crimes context src/billing/tax.ts --format json

# Scan only files changed in the working tree (post-edit gate inside an agent loop)
crimes scan --changed --format json
crimes scan --changed --base main --format json   # + commits on this branch

# Rank files by Git churn × current findings
crimes hotspots --since 90d --format json
```

You should see a colourful **CRIME SCENE REPORT** printed to your terminal.

---

## Status — current `main` (release candidate: `crimes@0.2.0`)

`crimes@0.1.0` is the latest tag on npm. Everything below ships from
`main` today and is verified by the publish-tarball smoke test in CI on
every commit; the next release will cut it as `crimes@0.2.0`.

- `crimes --help` / `crimes --version`
- `crimes scan [path]` — directory scan, default top-10
- `crimes scan [path] --format json` — stable JSON contract (`schema_version: "0.1.0"`)
- `crimes scan --changed [--base <ref>]` — restrict to working-tree-changed files,
  optionally also `<ref>...HEAD`
- `crimes scan --changed --fail-on low|medium|high` — exit `1` when a changed-set
  finding meets the threshold (the canonical changed-files CI gate)
- `crimes context <file>` — single-file findings + likely tests + safe-editing notes
- `crimes context <file> --format json`
- `crimes hotspots [path]` — Git churn × scan findings, ranked by aggregate change-risk
- `crimes hotspots [path] --since <window>` — `90d`, `2w`, `6m`, `1y`, or any `git log --since` string
- `crimes hotspots [path] --format json`
- `crimes diff <base...head>` — new / fixed / unchanged crimes between two
  Git refs (e.g. `main...HEAD`, `origin/main...HEAD`). Working-tree-safe —
  scans each ref via `git archive` into a temp dir.
- `crimes diff <base...head> --format json`
- `crimes baseline save [path]` — snapshot the current findings to
  `.crimes/baseline.json`. **The baseline file is intended to be committed.**
- `crimes baseline check [path]` — re-scan and fail only on findings absent
  from the saved baseline. `--fail-on low|medium|high` (default `medium`)
  sets the severity threshold; exit `1` blocks CI, exit `2` is reserved for
  missing / malformed baseline files and bad flags.
- `crimes verdict` — one-line "did this branch make the repo cleaner,
  worse, unchanged, or mixed?" — built on top of `crimes diff`. Default
  base is `origin/main`, then `main`. Advisory by default; opt into a
  blocking gate with `--fail-on worse | new-high | new-medium`.
- Four detectors: **God Function**, **God File**, **Unfinished Business**, **Temporal Recklessness**
- Bundled agent assets: [`AGENTS.md`](./AGENTS.md) and
  [`.claude/skills/crimes/SKILL.md`](./.claude/skills/crimes/SKILL.md)

See [`PRD.md`](./PRD.md) for the full spec.

---

## What's next — `crimes@0.2.0`

**Theme: branch and PR safety for humans and coding agents.**

`0.1.0` answered "what does this repo / file look like right now?".
`0.2.0` extends the same workflow to **change sets** — what a branch or
PR introduces vs. what was already there — so the same `crimes` you run
locally can gate a PR in CI.

Landing in `crimes@0.2.0`:

- **`crimes diff <base...head>`** ✅ — new, fixed, and unchanged findings
  between two Git refs. Working-tree-safe (`git archive` into a temp
  dir). See [Commands → `crimes diff`](#crimes-diff-basehead) above.
- **`crimes baseline save` / `crimes baseline check`** ✅ — snapshot
  current findings into `.crimes/baseline.json` so teams can adopt
  `crimes` on legacy code without fixing everything first, then fail CI
  only on findings introduced after the snapshot. See
  [Commands → `crimes baseline`](#crimes-baseline) below.
- **`crimes scan --changed --fail-on low|medium|high`** ✅ — exits non-zero
  when a finding in the changed-files set meets the threshold. The narrow,
  changed-files-only CI gate. JSON output gains `fail_on` / `failed` when
  the flag is set; `crimes scan` without `--changed` is unaffected.
- **`--fail-on new-high`** flag for `crimes diff` — exits non-zero on any
  new `severity: "high"` finding. (Planned.)
- **`crimes verdict`** ✅ — one-line "did this branch help or hurt?"
  summary, built on `crimes diff`. Defaults base to `origin/main` then
  `main`; advisory by default, opt-in CI gate via `--fail-on worse |
  new-high | new-medium`. See [Commands → `crimes verdict`](#crimes-verdict)
  below.
- **CI recipe** — copy-paste GitHub Actions snippet for failing PRs on
  new high-severity crimes.
- **JSON schema docs** — `DiffReport` ✅, `Baseline` ✅, and
  `VerdictReport` ✅ documented under the same `schema_version`
  discipline as `ScanReport`.

Deferred to later versions (see [`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md)):

- Richer per-finding risk model — `scores.churn`, `scores.test_gap`,
  `scores.blast_radius` (target: `0.3.0`)
- Cross-file `related_files`, `crimes explain <id>`, `crimes init`
  (target: `0.3.0`)
- Dependency-graph detectors and duplication detectors (target: `0.4.0`+)
- LLM-assisted features (`crimes ask`) — `v1+`
- Homebrew tap and standalone binaries (M6) — deferred until the CLI
  surface stabilises

---

## Example output

Running `pnpm scan:example` against the bundled fixture produces something
like:

```
CRIME SCENE REPORT
repo: messy-ts-app  ·  5 findings

HIGH severity (1)
  1. src/billing.ts:37-240 (generateInvoice)
     Charge: God Function
     Summary: generateInvoice spans 204 lines — past the 60-line threshold...
     Evidence:
       · lines 37–240 (204 lines)
       · 3.4× the configured 60-line threshold
       · function declaration
     id=crime_00001  confidence=0.95
  ...

Total 5  ·  high 1  medium 3  low 1
```

JSON output is the **stable product API** — see
[`docs/json-schema.md`](./docs/json-schema.md) for the full schema and
[`docs/agent-usage.md`](./docs/agent-usage.md) for the pre-edit / post-edit
workflow.

---

## What it finds (today)

| Detector            | Charge                | What it does                                                                    |
| ------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `large_file`        | God File              | Flags files over a line threshold (default 300)                                 |
| `large_function`    | God Function          | Flags functions / methods / arrows over a body-line threshold (default 60)     |
| `todo_density`      | Unfinished Business   | Flags files with high density of `TODO` / `FIXME` / `XXX` / `HACK` markers      |
| `direct_date`       | Temporal Recklessness | Flags direct uses of `Date.now()` and `new Date()` in source files              |

Every finding includes **evidence** (raw facts the detector observed) and
**scores** (`severity`, `confidence`, `agent_risk`) so downstream tools can
rank or filter without re-running heuristics.

---

## Commands

### `crimes scan [path]`

Scan a directory. Defaults to the current directory.

```bash
crimes scan
crimes scan ./packages/api
crimes scan --format json
crimes scan --all          # show every finding, not just the top 10
crimes scan --no-color     # plain output for pipes/CI
```

#### `crimes scan --changed`

Scan only the files that have changed in the working tree (staged,
unstaged, and untracked). With `--base <ref>`, also include everything that
differs between `<ref>...HEAD`. This is the agent-native pre/post-edit
loop: scan the files you are about to touch, make the change, then re-scan
the same set and diff the findings.

```bash
crimes scan --changed                                   # working-tree changes vs HEAD
crimes scan --changed --base main                       # + commits on this branch
crimes scan --changed --base origin/main                # + commits not yet on origin
crimes scan --changed --format json
crimes scan --changed --fail-on high                    # CI gate — exit 1 on a new high
crimes scan --changed --fail-on medium --format json    # CI gate, with JSON output
```

Notes:

- Requires a Git repository. Run outside one and `crimes` exits with a clear
  "not a git repository" error on stderr (exit code 2).
- Deleted files are skipped — there is nothing on disk to scan.
- Only JS/TS source files are scanned; non-source files in the changed set
  (Markdown, JSON, lockfiles, etc.) are ignored via the configured
  `include` / `exclude` patterns.
- `--fail-on low|medium|high` is **only** valid in combination with
  `--changed`. Passing it on a plain `crimes scan` exits `2` (usage
  error). When set, the JSON output adds `fail_on` and `failed` at the
  top level; exit `1` means "at least one finding in the changed set
  meets the threshold", exit `0` means it doesn't. See
  [`docs/ci.md`](./docs/ci.md) for the full CI integration recipe.

### `crimes context <file>`

Inspect a single file. Returns the findings on that file, the test files
that look likely to cover it, and short safe-editing notes for an agent —
all deterministic, no LLM, no git history.

```bash
crimes context src/billing/tax.ts
crimes context src/billing/tax.ts --format json
crimes context src/billing/tax.ts --root ./packages/api  # explicit repo root
```

The JSON payload is the stable contract — agents should consume that:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "context",
  "file": "src/billing.ts",
  "risk": { "level": "high", "high": 1, "medium": 1, "low": 1, "total": 3 },
  "findings": [ /* same Finding shape as `crimes scan` */ ],
  "likely_tests": ["src/billing.test.ts", "src/__tests__/billing.test.ts"],
  "agent_guidance": [
    "Prefer extracting pure helpers before adding more branches.",
    "Avoid adding more direct clock access; inject time where possible."
  ]
}
```

`likely_tests` is found by three deterministic conventions: same-basename
`.test.ts` / `.spec.ts` / `.test.tsx` / `.spec.tsx` siblings, files under
`__tests__/` matching the basename, and test files that import the target
via a relative path.

`agent_guidance` is a per-finding-type lookup — one line per detector that
fired, deduped. It is intentionally short and behavioural ("don't make this
worse"), not a fix recipe.

### `crimes hotspots [path]`

Rank files by **change risk** using Git history × current scan findings.
Default window is the last 90 days; pass `--since` to widen or narrow it.

```bash
crimes hotspots
crimes hotspots --since 30d
crimes hotspots --since 1y --format json
crimes hotspots --all                # show every file, not just the top 20
```

`--since` accepts the compact form `90d` / `2w` / `6m` / `1y`, or anything
`git log --since` understands (`"2 weeks ago"`, `"2026-01-01"`).

The risk score is a 0–1 blend of churn and findings:

```text
risk = 0.6 × min(change_count / 20, 1)
     + 0.4 × { high: 1.0, medium: 0.6, low: 0.3, none: 0 }[highest_severity]
```

Churn saturates at 20 commits in the window — beyond that, severity is the
only signal that moves the score.

In a **non-git directory**, `git_available` is `false`, `change_count` is `0`
for every row, and risk collapses to the severity component alone (max `0.4`).
The command still succeeds — it just produces a degraded ranking.

JSON output is the stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "hotspots",
  "repo": { "name": "messy-ts-app", "root": "/path/to/repo" },
  "since": "90d",
  "git_available": true,
  "hotspots": [
    {
      "file": "src/billing.ts",
      "change_count": 14,
      "latest_change": "2026-05-12T14:30:00+00:00",
      "finding_count": 3,
      "highest_severity": "high",
      "risk": 0.82
    }
  ]
}
```

### `crimes diff <base...head>`

Report **new**, **fixed**, and **unchanged** crimes between two Git refs.
The range must be the triple-dot form (`<base>...<head>`); the typical
inputs are `main...HEAD` locally or `origin/main...HEAD` in CI.

```bash
crimes diff main...HEAD
crimes diff origin/main...HEAD --format json
crimes diff v0.1.0...HEAD --no-color
```

`crimes diff` is **working-tree-safe** — it exports each ref into a fresh
temporary directory via `git archive` and scans it there. The working
tree is never checked out, stashed, or otherwise mutated.

Concise human output:

```
CRIMES DIFF
base: main
head: HEAD

New crimes: 2
Fixed crimes: 1
Unchanged crimes: 8
```

The JSON output is the stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "diff",
  "repo": { "name": "crimes", "root": "/path/to/repo" },
  "base": "main",
  "head": "HEAD",
  "summary": { "new": 2, "fixed": 1, "unchanged": 8 },
  "new_findings": [ /* same Finding shape as crimes scan */ ],
  "fixed_findings": [ /* ... */ ],
  "unchanged_findings": [ /* ... */ ]
}
```

Findings are matched across refs by a **stable fingerprint** —
`<type>::<file>::<symbol-or-empty>` — not by the per-scan `id`. Small line
shifts from unrelated edits do not register as fix + new; a function that
moves from lines 37–240 to 42–246 stays `unchanged`. See
[`docs/json-schema.md`](./docs/json-schema.md#diffreport-output-of-crimes-diff-basehead)
for the full schema, fingerprint design, and known limitations (e.g. file
renames register as a fix + new pair).

Exit code is `0` today even when there are new findings — `--fail-on
new-high` lands later in the `0.2.0` slice. Until then, gate on JSON:

```bash
crimes diff origin/main...HEAD --format json \
  | jq -e '.summary.new == 0' >/dev/null
```

### `crimes baseline`

Pin pre-existing findings so CI only fails on **new** crimes. The intended
adoption path for legacy repos: `crimes baseline save` once, commit
`.crimes/baseline.json`, then run `crimes baseline check` in CI on every
PR. New high-severity findings introduced by the branch fail the build;
the legacy debt stays out of the way.

```bash
# 1. Snapshot the current state. Run this once when adopting `crimes`.
crimes baseline save

# 2. Commit `.crimes/baseline.json` to the repo.
git add .crimes/baseline.json && git commit -m "Add crimes baseline"

# 3. Run on every PR. Exit 0 = no regression, exit 1 = blocking new findings.
crimes baseline check
crimes baseline check --fail-on high          # ignore new medium/low findings
crimes baseline check --format json           # the stable contract
```

Shape of `.crimes/baseline.json` (always carries `schema_version` and
`report_type: "baseline"`):

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "baseline",
  "created_at": "2026-05-16T12:00:00.000Z",
  "crimes_version": "0.2.0",
  "summary": { "total": 5, "high": 1, "medium": 3, "low": 1 },
  "findings": [
    {
      "fingerprint": "large_function::src/billing.ts::generateInvoice",
      "type": "large_function",
      "charge": "God Function",
      "severity": "high",
      "file": "src/billing.ts",
      "symbol": "generateInvoice"
    }
    // ...
  ],
  "repo": { "name": "messy-ts-app", "root": "/abs/path/to/repo" }
}
```

`crimes baseline check` re-scans the repo, matches findings against the
saved baseline by stable fingerprint (`<type>::<file>::<symbol-or-empty>`,
the same identity `crimes diff` uses), and emits a `BaselineCheckReport`:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "baseline_check",
  "repo": { "name": "messy-ts-app", "root": "/abs/path/to/repo" },
  "baseline_path": "/abs/path/to/repo/.crimes/baseline.json",
  "fail_on": "medium",
  "failed": false,
  "summary": {
    "total_baseline": 5,
    "total_current": 5,
    "new": 0,
    "fixed": 0,
    "unchanged": 5,
    "new_by_severity": { "high": 0, "medium": 0, "low": 0 }
  },
  "new_findings": [],
  "fixed_findings": [],
  "unchanged_findings": [ /* same Finding shape as crimes scan */ ]
}
```

Exit codes:

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | No new findings at or above `--fail-on` — branch is clean against baseline.   |
| `1`  | At least one new finding at or above `--fail-on` — the CI gate.               |
| `2`  | Missing or malformed baseline, bad `--format` / `--fail-on` flag.             |

Full schema, fingerprint semantics, and known limitations:
[`docs/json-schema.md`](./docs/json-schema.md#baseline-on-disk-shape-of-crimesbaselinejson).

### `crimes verdict`

Branch-level "did this branch make the repo cleaner, worse, unchanged, or
mixed?" summary. Built on top of `crimes diff` — same archive-into-temp
machinery, same fingerprint-based matching, same working-tree-safe
guarantees — with a single headline verdict layered on top.

```bash
crimes verdict                                # default base: origin/main → main
crimes verdict --base main                    # override base
crimes verdict --format json                  # the stable contract
crimes verdict --fail-on worse                # exit 1 when verdict is worse
crimes verdict --fail-on new-high             # exit 1 on any new high finding
crimes verdict --fail-on new-medium           # exit 1 on any new medium or high
```

Concise human output:

```
CRIMES VERDICT
base: origin/main
head: HEAD

Verdict: WORSE
New: 2
Fixed: 1
Reason: introduced 1 high-severity crime
Recommended next action: fix new high-severity findings before merging.
```

JSON output is the stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "verdict",
  "repo": { "name": "crimes", "root": "/path/to/repo" },
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

Judgement logic (deterministic, no LLM):

- **unchanged** — no new and no fixed findings.
- **worse** — any new high finding, OR new weighted severity > fixed
  weighted severity.
- **cleaner** — fixed weighted severity > new weighted severity AND no
  new high findings.
- **mixed** — both sides non-zero with equal weighted severity.

Severity weights are `high = 3`, `medium = 2`, `low = 1`. Treat the
verdict as an ordinal signal — the weights may change between minor
releases (same contract as the per-finding `scores.*` fields).

Exit codes:

| Exit | When                                                                                |
| ---- | ----------------------------------------------------------------------------------- |
| `0`  | Default — `crimes verdict` is advisory regardless of verdict.                       |
| `0`  | With `--fail-on`, threshold not hit.                                                |
| `1`  | With `--fail-on worse` and `verdict === "worse"`.                                   |
| `1`  | With `--fail-on new-high` and any new finding has `severity: "high"`.               |
| `1`  | With `--fail-on new-medium` and any new finding has `severity: "medium"` or `"high"`. |
| `2`  | Usage / environment error — not a git repo, no resolvable default base, bad flag.   |

Full schema: [`docs/json-schema.md`](./docs/json-schema.md#verdictreport-output-of-crimes-verdict).

More commands land in later milestones — see [`PRD.md` §22](./PRD.md) and
[`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md).

---

## CI

`crimes` is designed to run in CI. Three gating modes are supported, all
deterministic and JSON-first:

| Mode                 | Command                                                       | When to use                                                                       |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Changed-files gate   | `crimes scan --changed --fail-on high`                        | Repo already clean, or you only want to gate the diff itself.                     |
| Baseline gate        | `crimes baseline check --fail-on medium`                      | Legacy repo — snapshot `.crimes/baseline.json`, then fail only on **new** debt.   |
| Branch verdict gate  | `crimes verdict --base origin/main --fail-on new-high`        | PR summary signal that flips to a hard gate on any new high finding.              |

A copy-paste GitHub Actions workflow lives at
[`examples/github-actions/crimes.yml`](./examples/github-actions/crimes.yml).
The full integration guide — gating semantics, exit codes, known limits —
is in [`docs/ci.md`](./docs/ci.md).

Exit codes for every gating command are uniform:

| Exit | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | Command succeeded; no blocking findings under the configured `--fail-on`.    |
| `1`  | The configured `--fail-on` threshold was met. Treat as a CI gate failure.    |
| `2`  | Usage / environment error — bad flag, missing baseline, not a git repo, etc. |

Without `--fail-on`, `crimes scan`, `crimes diff`, and `crimes verdict`
are **advisory** — always exit `0`, regardless of findings.

---

## Configuration

Zero-config is the default. Drop a `crimes.config.json` at the repo root to override:

```json
{
  "include": ["src/**/*.{ts,tsx,js,jsx}"],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/*.generated.*"],
  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,
    "todoDensityPerKLoc": 10
  }
}
```

---

## Using `crimes` with coding agents

`crimes` ships with two on-disk artefacts that AI coding agents pick up
automatically. **There is nothing to install into a prompt** — point your
agent at the repo and it loads them itself.

| Agent                                            | What it reads                              |
| ------------------------------------------------ | ------------------------------------------ |
| Claude Code                                      | [`.claude/skills/crimes/SKILL.md`](./.claude/skills/crimes/SKILL.md) (+ `AGENTS.md`) |
| Codex CLI, Cursor, Aider, Continue, Copilot Workspace | [`AGENTS.md`](./AGENTS.md)            |
| Anything else                                    | [`docs/agent-usage.md`](./docs/agent-usage.md) — drop the workflow into your own rules file |

The recommended loop is the same for every agent:

```bash
# 1. Before editing — get a structured per-file briefing
crimes context <file> --format json

# 2. Make your change

# 3. After editing — re-scan only what you touched, diff the findings
crimes scan --changed --format json

# 4. For a wider triage — rank the whole repo by change-risk
crimes hotspots --format json
```

Decision rule: any **new `severity: "high"` finding** introduced by your
edit should be treated as a blocker — fix it, or call it out explicitly to
the user citing the finding `id` and `charge`.

The JSON output is a stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "scan",
  "repo": { "name": "messy-ts-app", "root": "/path/to/crimes/examples/messy-ts-app" },
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
      "summary": "generateInvoice spans 204 lines — past the 60-line threshold...",
      "evidence": ["lines 37–240 (204 lines)", "3.4× the configured 60-line threshold", "function declaration"],
      "scores": { "severity": 0.9, "confidence": 0.95, "agent_risk": 0.95 },
      "suggested_actions": [{ "kind": "extract_function", "description": "...", "risk": "low" }]
    }
  ]
}
```

For the full schema and the complete pre/post-edit workflow:

- 📄 [`docs/json-schema.md`](./docs/json-schema.md) — every field, what it means, what's reserved
- 🤖 [`docs/agent-usage.md`](./docs/agent-usage.md) — pre-edit/post-edit workflow, how to read findings, what's shipped vs deferred
- 🧰 [`docs/skills.md`](./docs/skills.md) — what's bundled for Claude Code, Codex, and friends
- 🧪 [`docs/fixtures/messy-ts-app.json`](./docs/fixtures/messy-ts-app.json) — full example output

---

## Repository layout

```
crimes/
├── apps/
│   └── website/              # crimes.sh — static HTML/CSS, deployed via Vercel
├── packages/
│   ├── cli/                  # crimes — Commander entrypoint, `crimes` binary (the published package)
│   ├── core/                 # @crimes/core — detector engine, finding schema, built-in detectors
│   ├── language-js/          # @crimes/language-js — file discovery + TS/JS AST parsing
│   └── reporter/             # @crimes/reporter — human and JSON output formats
├── examples/
│   └── messy-ts-app/         # intentionally crime-ridden fixture
├── .claude/skills/crimes/    # Claude Code skill
├── .github/workflows/        # ci.yml + release.yml (npm Trusted Publishing)
├── docs/                     # agent-usage, json-schema, skills, releasing
├── AGENTS.md                 # repo-level instructions for coding agents
├── PRD.md                    # product requirements document
├── ROADMAP_STATUS.md         # what currently ships vs what is planned
├── README.md
├── CONTRIBUTING.md
├── LICENSE                   # MIT
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Development

```bash
git clone https://github.com/andrewfantastic/crimes.git
cd crimes
pnpm install                  # install everything
pnpm build                    # build all packages (tsup)
pnpm typecheck                # tsc --noEmit across the workspace
pnpm test                     # vitest run across the workspace
pnpm scan:example             # build CLI + run it on the fixture
pnpm scan:example:json        # same, as JSON
pnpm --filter crimes smoke    # publish-tarball smoke test (pack → install → run)
```

Build a single package:

```bash
pnpm --filter @crimes/core build
```

The `smoke` script is the canonical "does the published package actually
work" check. It does an `npm pack`, installs the resulting tarball into a
clean temp directory with `npm install`, and runs `--version`, `--help`,
`scan`, `scan --format json`, `context`, and `hotspots` against
`examples/messy-ts-app`. CI runs it on every commit as the
`publish-smoke` job.

---

## Releasing

Releases are automated. Cut a release by tagging:

1. Bump `packages/cli/package.json` version on `main`.
2. Push, then create a GitHub Release with tag `vX.Y.Z`.
3. [`.github/workflows/release.yml`](./.github/workflows/release.yml)
   publishes to npm via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
   — no `NPM_TOKEN` required.
4. Vercel auto-deploys [crimes.sh](https://crimes.sh) from `main`.

Full recipe and one-time setup steps: [`docs/releasing.md`](./docs/releasing.md).

---

## Roadmap (short version)

- **M0 — Repo foundation** ✅ (`0.1.0`)
- **M1 — First working CLI** ✅ (`0.1.0`) — `crimes scan` with the structural-detector slice
- **M2 — Risk model** — `crimes hotspots` ✅ (`0.1.0`); per-finding `scores.churn` / `test_gap` planned for `0.3.0`
- **M3 — Agent context** — `crimes context <file>` ✅, `AGENTS.md` ✅, Claude skill ✅ (`0.1.0`); cross-file `related_files` planned for `0.3.0`
- **M4 — Diff and CI** — `crimes scan --changed` ✅ (`0.1.0`), `crimes diff <base...head>` ✅ (`0.2.0`), `crimes baseline save` / `crimes baseline check` ✅ (`0.2.0`), `crimes verdict` ✅ (`0.2.0`); **`--fail-on new-high` on `crimes diff` is the remaining `0.2.0` work**
- **M5 — Public launch** — npm ✅, [crimes.sh](https://crimes.sh) ✅ (`0.1.0`); full docs site planned
- **M6 — Homebrew / standalone binaries** — deferred

Full detail: [`PRD.md`](./PRD.md). Live status: [`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md).

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Issues and PRs welcome on
[github.com/andrewfantastic/crimes](https://github.com/andrewfantastic/crimes).

---

## License

[MIT](./LICENSE). Use it freely.
