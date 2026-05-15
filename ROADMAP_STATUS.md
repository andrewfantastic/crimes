# Roadmap status

Snapshot of the repo against the PRD milestones (`PRD.md` §22). Updated as
work lands. Authoritative spec stays in `PRD.md` — this file is a status
mirror, not a planning doc.

- **Current release target:** `crimes@0.1.0`
- **Last published version:** `crimes@0.0.1` (npm, 2026-05-15)
- **Published package:** [`crimes`](https://www.npmjs.com/package/crimes)
  on npm — `npm install -g crimes` and `npx crimes scan` both work today.
- **Website:** [crimes.sh](https://crimes.sh) — live, deployed from this
  monorepo via Vercel (auto-deploys on push to `main`).
- **Repository:** [`andrewfantastic/crimes`](https://github.com/andrewfantastic/crimes).

| Milestone                     | Status                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| M0 — Repo foundation          | ✅ done                                                                                  |
| M1 — First working CLI        | ✅ done                                                                                  |
| M2 — Risk model               | 🟡 partial — `crimes hotspots` shipped; per-finding `scores.churn` / `test_gap` pending |
| M3 — Agent context            | 🟡 partial — `crimes context` + `AGENTS.md` + Claude skill shipped                       |
| M4 — Diff and CI              | 🟡 partial — `crimes scan --changed [--base <ref>]` shipped; `diff` / `verdict` pending  |
| M5 — Public launch            | 🟡 partial — npm + crimes.sh live; release automation in this slice                      |
| M6 — Homebrew / binaries      | 🚧 not started                                                                            |

---

## What ships in `crimes@0.1.0`

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

## Partial — not finished in 0.1.0

- **Full risk model (M2).** Only `severity`, `confidence`, and `agent_risk`
  are populated on individual findings today. `scores.blast_radius`,
  `scores.churn`, and `scores.test_gap` are reserved in the schema but not
  computed per finding. `crimes hotspots` already blends churn × severity at
  the file level — promoting that into per-finding scores is the next step.
- **CI release automation (M5).** Trusted Publishing workflow ships in this
  slice. Changesets / automated changelog generation is not wired up;
  release notes are hand-written on the GitHub Release.
- **Docs maturity (M5).** Core docs are accurate against the shipped CLI,
  but there is no dedicated `/docs` subtree on the website yet — the
  landing page links into the GitHub markdown files. Astro + Starlight is
  the planned successor.

---

## Not yet — planned for later milestones

- `crimes diff <base...head>` — new vs fixed findings between two refs (M4)
- `crimes verdict` — branch-level "better / worse" summary (M4)
- `crimes baseline save` + `.crimes/baseline.json` (M4)
- `crimes ignore <id>` + `.crimes/suppressions.json` (M4)
- `crimes explain <id>` — long-form per-finding rationale (M3)
- `crimes ask "..."` — heuristic / LLM-assisted question answering (v1+)
- Dependency graph: circular dependencies, deep imports, layer violations
  (M1 deferred → M2/M3)
- Duplication detectors: exact and near-duplicate blocks, repeated string
  literals, duplicated role / status / plan checks (M1 deferred)
- Test-gap scoring on individual findings (M2)
- Cross-file `related_files` on every finding (M3)
- Homebrew tap and standalone binaries (M6)

---

## Recommended next versions

- **`0.1.0` (this release):** `crimes scan --changed` + `crimes context` +
  `crimes hotspots` + `AGENTS.md` / Claude skill + npm Trusted Publishing
  release automation + crimes.sh landing page polish.
- **`0.2.0`:** `crimes diff <base...head>`, `crimes verdict`,
  `crimes baseline save`, `crimes ignore <id>`, and a `--fail-on new-high`
  CI gate. This is the M4 "diff and CI" bundle.
- **`0.3.0`:** Richer risk model — per-finding `scores.churn` and
  `scores.test_gap`, test proximity signal feeding into `hotspots`,
  cross-file `related_files`, and the first dependency-structure
  detectors (circular dependencies, layer violations).

---

## Next concrete step (post-0.1.0)

In rough leverage order — these unlock the most product value:

1. **`crimes diff base...HEAD` + baseline (M4)** so CI can fail only on
   **new** high findings without drowning teams in legacy debt.
2. **Per-finding `scores.churn` and `scores.test_gap` (M2)** so the
   default scan ranking matches the PRD's "aggregate risk first" intent
   beyond the surface level.
3. **Cross-file `related_files` (M3)** — promote the per-file
   `likely_tests` signal onto every `Finding`, plus near-duplicate
   detection to surface alternate sources of truth.
4. **`crimes init` and config plumbing (M0/M1 polish)** — bootstrap a
   `crimes.config.json` with sensible architecture rules so the
   layer-violation detector can ship.
