# Roadmap status

Snapshot of the repo against the PRD milestones (`PRD.md` §22). Updated as
work lands. Authoritative spec stays in `PRD.md` — this file is a status
mirror, not a planning doc.

- **Active development target:** `crimes@0.2.0` — _branch and PR safety
  for humans and coding agents_
- **Last published version:** `crimes@0.1.0` (npm, 2026-05-15) ✅ shipped
- **Published package:** [`crimes`](https://www.npmjs.com/package/crimes)
  on npm — `npm install -g crimes` and `npx crimes scan` both work today.
- **Website:** [crimes.sh](https://crimes.sh) — live, deployed from this
  monorepo via Vercel (auto-deploys on push to `main`).
- **Repository:** [`andrewfantastic/crimes`](https://github.com/andrewfantastic/crimes).

| Milestone                     | Status                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| M0 — Repo foundation          | ✅ done (shipped in 0.1.0)                                                              |
| M1 — First working CLI        | ✅ done (shipped in 0.1.0)                                                              |
| M2 — Risk model               | 🟡 partial — `crimes hotspots` shipped; per-finding `scores.churn` / `test_gap` pending |
| M3 — Agent context            | 🟡 partial — `crimes context` + `AGENTS.md` + Claude skill shipped                       |
| M4 — Diff and CI              | 🟡 partial — `crimes scan --changed [--base <ref>]` ✅, `crimes diff <base...head>` ✅, `crimes baseline save` / `crimes baseline check` ✅; `verdict` / `--fail-on new-high` on `diff` are the remaining **0.2.0** work |
| M5 — Public launch            | 🟡 partial — npm + crimes.sh live; full `/docs` site still pending                       |
| M6 — Homebrew / binaries      | 🚧 not started                                                                            |

---

## ✅ Shipped in `crimes@0.1.0` (2026-05-15)

Everything below is verified by the publish-smoke test in CI on every
commit (`pnpm --filter crimes smoke`). Each command also accepts
`--format json`; the JSON output is the stable contract (see
[`docs/json-schema.md`](./docs/json-schema.md)).

### Commands

- `crimes --help` / `crimes --version`
- `crimes scan [path]` — directory scan, default top-10, `--all` for full list
- `crimes scan [path] --format json`
- `crimes scan --changed` — restrict to files changed in the working tree
- `crimes scan --changed --base <ref>` — also include commits unique to `<ref>...HEAD`
- `crimes context <file>` — per-file findings + likely tests + agent guidance
- `crimes context <file> --format json`
- `crimes hotspots [path]` — Git churn × findings, ranked by aggregate risk
- `crimes hotspots [path] --since <window>` — `90d`, `2w`, `6m`, `1y`, or anything `git log --since` understands
- `crimes hotspots [path] --format json`

### Detectors

- `large_file` — God File
- `large_function` — God Function
- `todo_density` — Unfinished Business
- `direct_date` — Temporal Recklessness (`Date.now()` / `new Date()`)

### Agent integrations

- [`AGENTS.md`](./AGENTS.md) — read by Codex CLI, Cursor, Aider, Continue,
  Copilot Workspace, etc.
- [`.claude/skills/crimes/SKILL.md`](./.claude/skills/crimes/SKILL.md) —
  Claude Code skill (loads on demand)
- [`docs/agent-usage.md`](./docs/agent-usage.md) — long-form pre/post-edit
  workflow
- [`docs/skills.md`](./docs/skills.md) — catalogue of bundled agent assets
- [`docs/json-schema.md`](./docs/json-schema.md) — stable wire format

### Release automation

- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — install, build,
  typecheck, test, scan smoke, publish-tarball smoke on every push / PR.
- [`.github/workflows/release.yml`](./.github/workflows/release.yml) —
  publishes to npm via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
  when a GitHub Release is published. No `NPM_TOKEN` required.
- [`docs/releasing.md`](./docs/releasing.md) — step-by-step release recipe
  and the one-time npmjs.com Trusted Publisher setup.

---

## 🎯 Active target — `crimes@0.2.0`

**Theme: branch and PR safety for humans and coding agents.**

`0.1.0` gave humans and agents a per-file / per-directory snapshot of
codebase risk. `0.2.0` extends that to **change sets** — what a branch or
PR introduces vs. what was already there — so the same workflow can run
inside CI and an agent loop on every commit, not just on demand.

The wedge is unchanged: deterministic, local, JSON-first. No LLM in the
core path. The only new artefacts on disk are `.crimes/baseline.json` and
the `diff` / `verdict` JSON shapes — all versioned by the same
`schema_version` as `crimes scan`.

### Landing in 0.2.0 so far

- ✅ **`crimes diff <base...head>`** — report **new**, **fixed**, and
  **unchanged** crimes between two Git refs. Working-tree-safe: each ref
  is exported via `git archive` into a temp directory and scanned there,
  so no checkout / stash / temporary commit ever touches the user's tree.
  Findings are matched by stable fingerprint
  `<type>::<file>::<symbol-or-empty>` so small line shifts from unrelated
  edits don't register as fix + new. JSON shape documented in
  [`docs/json-schema.md`](./docs/json-schema.md#diffreport-output-of-crimes-diff-basehead).
- ✅ **`crimes baseline save` / `crimes baseline check`** — snapshot the
  current findings to `.crimes/baseline.json` (intended to be committed)
  and gate future scans against that baseline. The same fingerprint
  identity as `crimes diff` does the matching, and `--fail-on
  low|medium|high` (default `medium`) controls the severity threshold
  that flips `failed: true` (exit `1`). Exit `2` is reserved for missing
  / malformed baselines and bad flags. Schemas (`Baseline`,
  `BaselineCheckReport`) documented in
  [`docs/json-schema.md`](./docs/json-schema.md#baseline-on-disk-shape-of-crimesbaselinejson).

### Planned for the rest of 0.2.0

- **`crimes diff --fail-on new-high`** — exit non-zero when the head ref
  introduces any new `severity: "high"` finding (the canonical CI gate).
- **`crimes verdict`** — branch-level "did this branch make the repo
  better or worse?" summary. Built on top of `crimes diff` for the
  current branch vs. its merge base.

### Planned docs

- **CI recipe** — concrete GitHub Actions snippet for failing PRs on
  new high-severity crimes (`crimes diff origin/main...HEAD --fail-on new-high`
  or `crimes baseline check`), plus the baseline alternative for legacy
  repos.
- **JSON schema docs** — `DiffReport` ✅, `Baseline` ✅, `BaselineCheckReport` ✅
  documented; `VerdictReport` still to come, under the same
  `schema_version` discipline as `ScanReport`.

### Out of scope for 0.2.0

These are deferred to later versions on purpose — the 0.2.0 cut stays
narrow so the diff/verdict/baseline trio can land cleanly and CI
integrations have a stable target.

- `crimes ignore <id>` + `.crimes/suppressions.json` — defer to `0.3.0`.
  The baseline workflow covers the "don't fail on legacy" use case for
  0.2.0; per-finding suppressions are an orthogonal feature.
- `crimes explain <id>` — defer to `0.3.0`.
- `crimes init` and config plumbing — defer to `0.3.0`.

---

## 🚧 Planned for later versions

### `0.3.0` candidates

- **Richer risk model (M2):** per-finding `scores.churn`, `scores.test_gap`,
  `scores.blast_radius`. Promote the file-level signal `crimes hotspots`
  already blends into per-finding scores so the default scan ranking
  matches the PRD's "aggregate risk first" intent end-to-end.
- **Cross-file `related_files` on every finding (M3).**
- **`crimes explain <id>`** — long-form per-finding rationale (M3).
- **`crimes init`** + config plumbing — bootstrap a `crimes.config.json`
  with sensible architecture rules so the layer-violation detector can
  ship.
- **`crimes ignore <id>`** + `.crimes/suppressions.json` (M4 polish).

### `0.4.0`+ candidates

- **Dependency graph detectors:** circular dependencies, deep imports,
  layer violations driven by `architecture.layers` config.
- **Duplication detectors:** exact and near-duplicate blocks, repeated
  string literals, duplicated role / status / plan checks.
- **Test-proximity-as-risk** feeding into `hotspots` and per-finding
  `test_gap` scoring.
- **`crimes ask "..."`** — heuristic / LLM-assisted question answering (v1+).

### Distribution (later)

- Homebrew tap and standalone binaries (M6) — deferred until the CLI
  surface stabilises through 0.2.0 and 0.3.0.

---

## Why this slice for 0.2.0

In rough leverage order — these unlock the most product value once
`crimes scan` is in users' hands:

1. **`crimes diff base...HEAD` + baseline (M4)** so CI can fail only on
   **new** high findings without drowning teams in legacy debt. This is
   the single highest-impact feature still missing from the PRD's M4
   bundle, and the one most CI integrations are waiting on.
2. **`crimes verdict`** because it turns the same diff signal into a
   one-line "did this branch help or hurt?" answer that fits a PR
   comment or an agent's end-of-task summary.
3. **CI docs** because shipping `--fail-on new-high` without a copy-paste
   GitHub Actions recipe leaves users to guess at the integration.
4. **Baseline docs in the JSON schema** so the new on-disk artefact
   (`.crimes/baseline.json`) is treated as a stable contract from day
   one — same versioning discipline as `ScanReport`.

After 0.2.0, the next bottleneck shifts back to **detector signal**: the
richer per-finding scores and cross-file relationships that `0.3.0`
targets.
