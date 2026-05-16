# Roadmap status

Snapshot of the repo against the PRD milestones (`PRD.md` §22). Updated as
work lands. Authoritative spec stays in `PRD.md` — this file is a status
mirror, not a planning doc.

- **Last published version:** `crimes@0.4.0` (npm) ✅ shipped — _agent
  context quality and signal-to-noise_. `packages/cli/package.json`
  tracks the latest shipped version. Release notes:
  [`docs/releases/v0.4.0.md`](./docs/releases/v0.4.0.md).
- **Previously shipped milestones:** `crimes@0.3.0` — _information
  architecture crimes_ — and `crimes@0.2.0` — _branch and PR safety for
  humans and coding agents_. Both are live on npm and exercised by the
  publish-tarball smoke test in CI on every commit.
- **Published package:** [`crimes`](https://www.npmjs.com/package/crimes)
  on npm — `npm install -g crimes` and `npx crimes scan .` both work today.
- **Website:** [crimes.sh](https://crimes.sh) — live, deployed from this
  monorepo via Vercel (auto-deploys on push to `main`).
- **Repository:** [`andrewfantastic/crimes`](https://github.com/andrewfantastic/crimes).

| Milestone                     | Status                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| M0 — Repo foundation          | ✅ done (shipped in 0.1.0)                                                              |
| M1 — First working CLI        | ✅ done (shipped in 0.1.0)                                                              |
| M2 — Risk model               | 🟡 partial — `crimes hotspots` shipped; per-finding `scores.churn` / `test_gap` / `blast_radius` deferred to 0.5.0+. `0.4.0` adds shallow-clone awareness via `history_limited`. |
| M3 — Agent context            | 🟢 expanded again in `0.4.0` — `crimes context` + `AGENTS.md` + Claude skill (0.1.0); cross-file `related_files` on IA findings (0.3.0); deterministic neighbourhood `related_files`, monorepo-root auto-detection, shape-aware `large_function`, top-level `agent_guidance` ordering, and empty-field reasons (0.4.0). |
| M4 — Diff and CI              | 🟢 0.2.0 shipped — `scan --changed [--base]` ✅, `scan --changed --fail-on` ✅, `diff` ✅, `baseline save` / `baseline check` ✅, `verdict` ✅, [`docs/ci.md`](./docs/ci.md) + [GitHub Actions example](./examples/github-actions/crimes.yml) ✅. `diff --fail-on new-high` and per-finding ignore / suppressions still deferred. |
| M5 — Public launch            | 🟡 partial — npm + crimes.sh live; full `/docs` site still pending                       |
| M6 — Homebrew / binaries      | 🚧 not started                                                                            |

---

## ✅ Shipped in `crimes@0.1.0` (2026-05-15)

Every command below is verified by the publish-smoke test in CI on every
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

## ✅ Shipped in `crimes@0.2.0`

**Theme: branch and PR safety for humans and coding agents.**

`0.1.0` gave humans and agents a per-file / per-directory snapshot of
codebase risk. `0.2.0` extends that to **change sets** — what a branch or
PR introduces vs. what was already there — so the same workflow can run
inside CI and an agent loop on every commit, not just on demand.

The wedge is unchanged: deterministic, local, JSON-first. No LLM in the
core path. The only new artefacts on disk are `.crimes/baseline.json` and
the `diff` / `verdict` / `baseline_check` JSON shapes — all versioned by
the same `schema_version` as `crimes scan`.

### ✅ Completed in `0.2.0`

- **`crimes diff <base...head>`** — report **new**, **fixed**, and
  **unchanged** crimes between two Git refs. Working-tree-safe: each ref
  is exported via `git archive` into a temp directory and scanned there,
  so no checkout / stash / temporary commit ever touches the user's tree.
  Findings are matched by stable fingerprint
  `<type>::<file>::<symbol-or-empty>` so small line shifts from unrelated
  edits don't register as fix + new. JSON shape documented in
  [`docs/json-schema.md`](./docs/json-schema.md#diffreport-output-of-crimes-diff-basehead).
- **`crimes baseline save` / `crimes baseline check`** — snapshot the
  current findings to `.crimes/baseline.json` (intended to be committed)
  and gate future scans against that baseline. The same fingerprint
  identity as `crimes diff` does the matching, and `--fail-on
  low|medium|high` (default `medium`) controls the severity threshold
  that flips `failed: true` (exit `1`). Exit `2` is reserved for missing
  / malformed baselines and bad flags. Schemas (`Baseline`,
  `BaselineCheckReport`) documented in
  [`docs/json-schema.md`](./docs/json-schema.md#baseline-on-disk-shape-of-crimesbaselinejson).
- **`crimes verdict`** — branch-level "did this branch make the repo
  cleaner, worse, unchanged, or mixed?" summary. Built on top of
  `crimes diff` (same archive-into-temp machinery, same fingerprint
  matching). Default base picks `origin/main` first, then `main`;
  exits `2` if neither resolves and no `--base` is passed. Advisory
  by default (always exits `0`); opt into a CI gate with `--fail-on
  worse | new-high | new-medium`. Severity weights are `high = 3`,
  `medium = 2`, `low = 1`. Schema (`VerdictReport`) documented in
  [`docs/json-schema.md`](./docs/json-schema.md#verdictreport-output-of-crimes-verdict).
- **`crimes scan --changed --fail-on low|medium|high`** — the
  changed-files-only CI gate. Only valid in combination with
  `--changed`; passing it on a plain `crimes scan` exits `2`. When set,
  the JSON output gains two optional top-level fields (`fail_on`,
  `failed`) — both absent on the default advisory `scan` path so the
  existing contract is unchanged. Exit `1` when at least one finding
  in the changed set meets the threshold; exit `0` otherwise. Schema
  delta documented in
  [`docs/json-schema.md`](./docs/json-schema.md#scan---changed---fail-on-gate-fields).
- **CI integration docs** — [`docs/ci.md`](./docs/ci.md) covers the
  three recommended gating modes (changed-files, baseline, branch
  verdict) and the shared exit-code contract.
  [`examples/github-actions/crimes.yml`](./examples/github-actions/crimes.yml)
  is the copy-paste workflow that ships with the repo.
- **Schema / report consistency pass** — every report now carries a
  `report_type` discriminator (`"scan"`, `"context"`, `"hotspots"`,
  `"diff"`, `"baseline"`, `"baseline_check"`, `"verdict"`) under the
  same `schema_version`. Consumers can route on a single field.

### Deferred from `0.2.0` (and still deferred after `0.3.0`)

The following are explicitly **not in `0.2.0` or `0.3.0`** and remain
tracked for later versions. Don't document them as shipped.

- **`crimes diff --fail-on new-high`** — exit non-zero when the head
  ref introduces any new `severity: "high"` finding. Until it lands,
  gate on JSON (`jq -e '.summary.new == 0'`) or use
  `crimes verdict --fail-on new-high` / `crimes scan --changed
  --fail-on high` / `crimes baseline check`.
- **`crimes ignore <id>`** + `.crimes/suppressions.json` per-finding
  suppressions. The baseline workflow covers the "don't fail on legacy
  debt" use case in the meantime.
- **`crimes explain <id>`** — long-form per-finding rationale.
- **`crimes init` + config plumbing** — bootstrap a
  `crimes.config.json` with sensible architecture rules.
- **`crimes ask` / LLM-assisted modes** — `v1+`.
- **Dependency-graph detectors** — circular dependencies, deep imports,
  layer violations driven by `architecture.layers` config. `0.4.0+`.
- **Duplication detectors** — exact and near-duplicate blocks, repeated
  string literals, duplicated role / status / plan checks. `0.4.0+`.
- **Homebrew tap + standalone macOS / Linux / Windows binaries** —
  deferred until the CLI surface stabilises.

---

## ✅ Shipped in `crimes@0.3.0`

**Theme: information architecture crimes.**

> **Implementation plan: [`IA_CRIMES_PLAN.md`](./IA_CRIMES_PLAN.md).**
> Detector taxonomy, scope recommendation, IA-index architecture,
> extraction strategy, fixture plan, sequencing, and success criteria
> for `0.3.0` live there. This section is the status mirror.

`0.2.0` made `crimes` useful for branches, PRs, CI, and agent loops —
the change-set surface is now covered. `0.3.0` makes `crimes` better
at detecting **repo structure drift that confuses humans, coding
agents, teams, and customers**.

Information architecture crimes expose the places where a repo gives
multiple competing answers to the same structural question — what a
concept is called, where it lives, which implementation owns it, how
users move through the product, who is allowed to do what. They are
the most distinctive form of agent-risk `crimes` can ship: deterministic
evidence of source-of-truth ambiguity that linters and security scanners
do not look for, and that AI coding agents repeatedly trip over when
they pick the wrong vocabulary, the wrong route, or the wrong copy of a
shared piece of nav.

### ✅ Completed in `0.3.0`

- **IA concept index foundation** —
  [`packages/core/src/ia/`](./packages/core/src/ia/) builds a
  deterministic per-scan `IaIndex` (route signals, nav sources, label
  signals, alias seeds, agent-context discovery, markdown link graph)
  consumed by every IA detector through `DetectorContext.ia`. The
  index is computed once in the same pass as file discovery and AST
  parsing; no detector reaches into the language pack directly.
- **`missing_agent_context`** — flags repos that declare a `bin` in
  `package.json` but ship no `AGENTS.md`, `CLAUDE.md`, or
  `.claude/skills/*/SKILL.md`. Medium severity, 0.90 confidence.
- **`route_metadata_drift`** — flags routes whose path, file location,
  default-export component, `<title>` / `metadata.title`, and
  nav-source labels appear to describe the destination with competing
  concept tokens. Requires ≥3 disagreeing sources; layouts and generic
  root routes are excluded. Medium severity, 0.60–0.80 confidence.
- **`duplicated_navigation_source`** — flags single internal
  destinations that appear in two or more nav-like sources with
  different non-empty labels. Medium severity, 0.70–0.85 confidence.
- **`concept_alias_drift`** — flags alias groups (`team` / `workspace`
  / `organisation`; `plan` / `tier` / `subscription`; etc.) where ≥3
  aliases each appear in ≥2 distinct directories with at least one
  product-surface hit. Capped at the three strongest groups per scan.
  Low–medium severity, 0.60–0.75 confidence.
- **`docs_code_drift`** — flags broken local links in `docs/**/*.md`
  and root-level `*.md` / `*.mdx`. Low severity, 0.90 confidence.
- **Cross-file `related_files`** — populated by the IA detectors and
  rendered as an "Also touches:" block (capped at 5, with overflow
  noted) in the human reporter. JSON output is unchanged.
- **Petty crimes detector family** — `commented_out_code`,
  `logic_in_comments`, `name_behavior_mismatch`,
  `magic_domain_literal_scatter`, `weak_test_signal`,
  `option_bag_junk_drawer`, `return_shape_roulette`, and
  `negative_flag_maze` ship as evidence-backed maintainability findings.
  They stay under the existing `Finding` shape and do not add a new
  severity level. See
  [`docs/finding-types/petty.md`](./docs/finding-types/petty.md).
- **Route Metadata Drift evidence cap raised from 6 → 8** so both nav
  labels in a multi-source drift fit alongside the route path / file /
  component / title evidence without losing data to truncation.
- **Public fixture demonstrates all five IA finding types.** The
  bundled [`examples/messy-ts-app`](./examples/messy-ts-app) fixture
  emits at least one finding from each of the five IA detectors. The
  pinned sample output at
  [`docs/fixtures/messy-ts-app.json`](./docs/fixtures/messy-ts-app.json)
  is regenerated from a real scan — not hand-edited.
- **Long-form IA reference docs.**
  [`docs/finding-types/ia.md`](./docs/finding-types/ia.md) covers each
  shipped detector: what it reads, example evidence, why it matters,
  suggested fixes, and a "false positives" section. Wired into
  [`docs/agent-usage.md`](./docs/agent-usage.md) and
  [`docs/json-schema.md`](./docs/json-schema.md).

The new `Finding.type` values land additively under the same
`schema_version: "0.1.0"`. No schema bump. The CLI surface
(`scan` / `context` / `hotspots` / `diff` / `baseline` / `verdict`) is
unchanged — IA findings ride the existing report shapes.

### Self-scan note

Running `crimes scan .` on the crimes monorepo from the repo root
will surface findings from the bundled fixture
([`examples/messy-ts-app`](./examples/messy-ts-app)) — by design,
since the fixture is intentionally crime-ridden. The default
`exclude` list does **not** ignore `examples/`, so a full repo
self-audit may include 1–2 IA findings inherited from the fixture
(typically a `missing_agent_context` charge against the inner
`messy-ts-app` workspace because it ships a `bin` without an
`AGENTS.md`). Recommended workflows for a clean self-audit:

- Scan only first-party code: `crimes scan packages docs`.
- Or exclude the fixture in a `crimes.config.json`:
  `{ "exclude": ["examples/**"] }`. Config plumbing is deferred to
  `0.3.x` / `0.4.0`, but `fast-glob`'s `exclude` already honours the
  pattern.
- Or pass `--all` to see every finding and visually filter the
  fixture-induced ones.

The "low-noise on the crimes repo itself" success criterion in
[`IA_CRIMES_PLAN.md`](./IA_CRIMES_PLAN.md) §13 is evaluated against
the first-party tree, not the whole repo.

### Deferred from `0.3.0`

Tracked for later versions. **Do not** document them as shipped.

IA detectors still on the long-term roadmap:

- **`orphaned_destination`** — page / route / screen files
  unreachable from primary navigation, route registries, or internal
  links. Needs route discovery to mature.
- **`parallel_destination`** — multiple pages or flows that appear to
  serve the same user intent (`/billing` vs `/settings/billing`
  vs `/account/subscription`; `InviteUserModal` vs
  `AddTeamMemberDialog`). Needs near-duplicate scoring to avoid noisy
  guesses.
- **`permission_ia_drift`** — nav, route guards, docs, and policy
  code describe access using different roles. Requires policy /
  route-guard discovery.
- **`action_label_drift`** — semantic drift in action and object
  labels ("Delete" / "Remove" / "Archive"; "User" / "Member" /
  "Seat").
- **Command-drift variant of `docs_code_drift`** — docs that
  reference a CLI command the published `bin` no longer implements.
  Needs deterministic command-registration scanning.

Supporting work also deferred (tracked for `0.3.x` / `0.4.0+`):

- **Richer per-finding scores (M2):** `scores.churn`,
  `scores.test_gap`, and `scores.blast_radius` on every finding.
- **`crimes explain <id>`** — long-form per-finding rationale (M3).
- **`crimes ignore <id>`** + `.crimes/suppressions.json` per-finding
  suppressions.
- **`crimes diff --fail-on new-high`** — finish the M4 CI-gate trio.
- **`crimes init` + config plumbing** — bootstrap
  `crimes.config.json` with sensible defaults.

---

## ✅ Shipped in `crimes@0.4.0`

**Theme: agent context quality and signal-to-noise.**

> **Implementation plan:
> [`AGENT_CONTEXT_QUALITY_PLAN.md`](./AGENT_CONTEXT_QUALITY_PLAN.md).**
> Scope, root-detection fix, neighbourhood discovery, shape-aware
> `large_function`, schema additions, and prompt sequence for `0.4.0`
> live there. This section is the status mirror.

Real-repo trials of `0.3.0` with Claude Code and Codex CLI surfaced
two coupled gaps: (1) `crimes context` did not tell agents what _else_
to read before editing the target file, and (2) several existing
detectors were noisy enough on production repos (React pages, route
handlers, test callbacks, GitHub-relative README links, shallow git
clones, nested-package roots) that agents started to discount the
report. `0.4.0` raises the context floor and lowers the noise ceiling
_before_ adding more detectors — no new detectors ship in this
release.

### ✅ Completed in `0.4.0`

- **Monorepo / nested-package root detection for `crimes context`** —
  `findNearestPackageRoot` walks up from the target file to the nearest
  enclosing `package.json` and uses that as the scan root. Explicit
  `--root` still wins. Output paths are normalised against the chosen
  root so `crimes context examples/messy-ts-app/src/foo.ts` from the
  monorepo root and `crimes context src/foo.ts` from inside the
  package produce equivalent reports.
- **Deterministic neighbourhood `related_files` on `ContextReport`** —
  new
  [`packages/core/src/context-related-files.ts`](./packages/core/src/context-related-files.ts)
  ranks up to 10 files an agent should read before editing the target,
  using four heuristics: IA finding passthrough (`related to <charge>`),
  shared IA path tokens, domain-prefix filename matches, and same-
  directory siblings. Each entry carries a `reason` string and an
  ordinal `score`. Files already in `likely_tests` are excluded.
- **Shape-aware `large_function`** — `ParsedFunction` carries a new
  `shape: FunctionShape` (`domain | test_callback | react_component |
  page_export | route_handler | unknown`) computed during AST parsing.
  Per-shape thresholds (60/200@low/200/200/100/80) replace the single
  60-line cut-off. Test callbacks no longer dominate scans; React pages
  and route handlers get appropriate budgets; `generateInvoice`'s
  fixture finding still flags at high.
- **`_test.ts` / `_spec.ts` likely-test discovery** — Go-style suffix
  conventions (`foo_test.ts`, `foo_spec.ts`) join the existing
  `.test.ts` / `.spec.ts` / `__tests__/` rules.
- **`docs_code_drift` GitHub-relative link allowlist** — `../../issues`,
  `../../pull/N`, `../../wiki/Home`, `../../blob/main/PRD.md`, and
  the rest of the GitHub-rewritten path set are no longer flagged as
  broken local links. Real `../../docs/foo.md` paths still resolve.
- **`ScanReport.changed_files`** — `crimes scan --changed --format json`
  now emits a top-level array listing every file the resolver returned,
  sorted and deduplicated, **including** files with zero findings
  (touched markdown, lockfiles, etc.). Plain `crimes scan` omits the
  field.
- **`HotspotsReport.history_limited` + `history_limited_reason`** —
  detected via `git rev-parse --is-shallow-repository`. The human
  reporter prints `(history limited: …)` on the same line as the
  existing not-a-git-repo notice. Agents should downweight rankings
  when the flag is set.
- **Top-level `agent_guidance` ordering in `ContextReport`** —
  serialised JSON now places `agent_guidance` ahead of `findings` so
  agents read the actionable summary first. Same wording as 0.3.0.
- **Neighbourhood guidance line** — when a target file has no findings
  but does have related files, `agent_guidance` gains a single line
  pointing the agent at the neighbourhood instead of being empty.
- **Empty-field self-explanation** — `agent_guidance_reason`,
  `related_files_reason`, and `likely_tests_reason` are each set
  **only when** the matching array is empty. Distinguishes "we
  searched and found nothing" from "we didn't search".

All additions land additively under the same
`schema_version: "0.1.0"`. **No schema bump.** No CLI behaviour
regressions. JSON consumers that read by key name (the recommended
pattern) are unaffected by the `agent_guidance` reordering.

### Deferred from `0.4.0`

Tracked for `0.5.0` or later. **Do not** document them as shipped.

- **`crimes init` + `crimes.config.json` plumbing** — moves to
  `0.5.0` alongside suppressions.
- **`crimes ignore <id>` + `.crimes/suppressions.json`** — moves to
  `0.5.0`. The noise-reduction work in `0.4.0` removed most of the
  underlying demand.
- **More IA detectors** — `orphaned_destination`,
  `parallel_destination`, `permission_ia_drift`, `action_label_drift`,
  command-drift variant of `docs_code_drift`. Pre-empted by the "no
  more detectors before fixing noise" feedback.
- **Per-finding `scores.churn` / `scores.test_gap` / `scores.blast_radius`** —
  M2 work; large surface area, deferred again.
- **`crimes diff --fail-on new-high`** — finish the M4 CI-gate trio.
- **`crimes explain <id>`** — long-form per-finding rationale.
- **`crimes ask` / LLM-assisted modes** — `v1+`.
- **Homebrew tap + standalone binaries** — deferred until the CLI
  surface stabilises further.
- **Importer / importee detection in `related_files`** — would require
  walking every file's imports. Deferred; the four shipped heuristics
  cover the common cases.
- **CLI breadcrumb when the auto-detected package root differs from
  cwd** — the auto-detection works silently. A one-line stderr note
  was suggested in the plan; deferred.
- **`pnpm-workspace.yaml` / `turbo.json` as additional monorepo
  markers** — `package.json` alone covers >95% of cases.

---

## 🎯 Next target — `crimes@0.5.0` (tentative)

> **Implementation plan:
> [`SUPPRESSIONS_CONFIG_EXPLAIN_PLAN.md`](./SUPPRESSIONS_CONFIG_EXPLAIN_PLAN.md).**
> Product framing, scope evaluation (must/should/could/defer), config
> shape, suppression file design, `crimes explain` CLI, JSON schema
> implications, CI semantics, prompt sequence, and success criteria for
> `0.5.0` live there. This section is the status mirror.

**Theme (recommended): suppressions, config, and explainability —
the three levers teams need to adopt `crimes` without fighting
legitimate exceptions.** The 0.4.0 release made existing detectors
quieter and more trustworthy; 0.5.0 closes the M4 polish gap with the
work that was deferred from 0.2.0 and 0.4.0:

- **`crimes init`** writes a starter `crimes.config.json` with
  sensible defaults and inline pointers at the new knobs.
- **Config loader extension** — `zod`-validated `CrimesConfig` with
  per-shape `large_function` thresholds, `ia.aliasGroups`,
  `detectors.{enable,disable}`, a `suppressions.path` override, and a
  reserved `architecture.layers` placeholder.
- **`.crimes/suppressions.json`** — fingerprint-keyed, `reason`
  required, intended to be committed and reviewable in PRs.
- **`crimes ignore <fingerprint-or-id> --reason "…"`** writes the
  file; the `<type>::<file>::<symbol-or-empty>` fingerprint is the
  same identity `crimes diff` and `crimes baseline` already use.
- **Suppression application across `scan`, `context`,
  `baseline check`, `diff`, `verdict`** — default-hide with
  `suppressed_count`; `--show-suppressed` opt-in; never trips a
  `--fail-on` gate on a suppressed finding.
- **`crimes explain <id-or-fingerprint> [--from <scan.json>]`** prints
  the long-form rationale per finding type — what the detector
  observed, why it matters, what to do, and the exact
  `crimes ignore` command to use if the team decides to live with it.
- **`crimes diff --fail-on new-high | new-medium`** — completes the
  M4 CI-gate trio (`scan --changed`, `baseline check`, `verdict`).

Per-finding `scores.churn` / `scores.test_gap` / `scores.blast_radius`
remain **deferred** in `SUPPRESSIONS_CONFIG_EXPLAIN_PLAN.md` §3.G —
M2 work touches every detector and deserves its own release rather
than a wedge into the suppressions theme.

The wedge stays the same: deterministic, local, JSON-first, no LLM.

---

## 🚧 Planned for later versions

### `0.4.0+` candidates

- **Dependency graph detectors:** circular dependencies, deep imports,
  layer violations driven by `architecture.layers` config.
- **Duplication detectors:** exact and near-duplicate blocks, repeated
  string literals, duplicated role / status / plan checks.
- **Test-proximity-as-risk** feeding into `hotspots` and per-finding
  `test_gap` scoring.
- **Frontend agent-risk detectors:** UI / UX findings that predict fragile
  edits, design-system drift, or user-facing regressions. This is not a
  taste engine or visual-design grader; findings must stay deterministic,
  evidence-backed, and tied to change risk.
- **Information architecture detectors:** product-structure findings that
  reveal concept drift, route / navigation drift, ambiguous sources of
  truth, orphaned destinations, or fragmented workflows. This extends the
  agent-risk thesis into product taxonomy: can a human or agent tell what a
  thing is called, where it belongs, and which implementation owns it?
- **Petty crimes follow-ups:** repeated domain literals, weak tests, option
  bag junk drawers, return-shape roulette, and negative flag mazes. See
  [`PETTY_CRIMES_PLAN.md`](./PETTY_CRIMES_PLAN.md). This track must stay
  out of style-lint territory: no tabs-vs-spaces, import-order, or generic
  formatting rules.
- **`crimes ask "..."`** — heuristic / LLM-assisted question answering (v1+).

### Frontend / UI risk candidates

These are worth exploring if they stay inside the core `crimes` thesis:
**where is future change likely to go wrong, and what should a human or
agent know before editing?** They should not become generic aesthetic lint
rules, and they should avoid duplicating tools like axe, Lighthouse,
Storybook, Chromatic, ESLint, or design-token linters.

- **Design Token Escape:** hard-coded colors, spacing, shadows, radii,
  z-indexes, or breakpoints in app components when local tokens or theme
  variables already exist. Agent value: discourages one-off UI patches that
  bypass the design system.
- **Duplicate Component Shape:** repeated JSX / template structures for
  buttons, cards, forms, modals, tables, empty states, and similar shared UI.
  Agent value: points agents toward existing primitives before they create
  another near-copy.
- **Accessible Interaction Risk:** clickable non-buttons, icon-only controls
  without accessible labels, custom controls without obvious keyboard
  affordances, or dialogs without focus-management signals. Agent value:
  flags UI surfaces that are easy to regress during small edits.
- **Responsive Fragility:** fixed widths, viewport-scaled typography,
  absolute-positioned copy over dynamic content, hard-coded grid columns
  without mobile alternatives, or tables/cards without an overflow strategy.
  Agent value: tells agents when a visual change needs mobile inspection.
- **Copy / IA Drift:** inconsistent labels for the same action or domain
  concept, duplicated empty-state copy, hard-coded plan / role / status text,
  or UI copy that appears to encode business rules. Agent value: surfaces
  ambiguous sources of truth before another label or rule is duplicated.
- **Visual Regression Review Hint:** not a screenshot engine, but a detector
  that says "this changed UI file deserves visual review" when churn,
  responsive complexity, lack of stories/tests, and component centrality line
  up. Agent value: recommends Playwright / Storybook / screenshot checks at
  the right time.

Initial frontend detector priority, if this track is promoted:

1. **Design Token Escape** — easiest to make deterministic and low-noise.
2. **Accessible Interaction Risk** — high practical value, but keep it to
   agent-risk signals rather than a full accessibility scanner.
3. **Duplicate Component Shape** — larger implementation surface, but likely
   strong differentiation once near-duplicate JSX detection is in place.

### Information architecture risk candidates

IA crimes are especially aligned with `crimes` because they expose product
structure drift before it turns into duplicated code, conflicting business
rules, or agent confusion. The detector should not judge whether the product
taxonomy is "good"; it should surface evidence that the repo contains
multiple competing answers to the same structural question.

- **Concept Alias Drift:** the same domain concept appears under multiple
  names across identifiers, routes, headings, translation keys, constants,
  docs, and tests. Examples: `organization` / `workspace` / `team` /
  `account`, or `plan` / `tier` / `subscription` / `package`. Agent value:
  prevents new edits from choosing the wrong vocabulary or duplicating a
  rule under another name.
- **Route Metadata Drift:** route paths, nav labels, page titles,
  breadcrumbs, component names, and file names disagree. Example:
  `/settings/billing` is labelled "Plans", headed "Subscription", and
  implemented by `PricingPage.tsx`. Agent value: tells an editor to inspect
  the whole destination before renaming, moving, or extending it.
- **Duplicated Navigation Source:** nav arrays, route registries,
  breadcrumbs, sitemap metadata, and sidebar definitions repeat the same
  destination data in multiple files. Agent value: identifies which source
  may be stale before an agent updates only one copy.
- **Orphaned Destination:** page, route, or screen files exist but are not
  reachable from primary navigation, route registries, sitemap metadata, or
  internal links. Agent value: warns that a file may be abandoned or
  non-canonical before treating it as the source of truth.
- **Parallel Destination:** multiple pages or flows appear to serve the same
  user intent. Examples: `/billing`, `/settings/billing`, and
  `/account/subscription`, or `InviteUserModal` and
  `AddTeamMemberDialog`. Agent value: forces a source-of-truth decision
  before another parallel implementation is extended.
- **Workflow Fragmentation:** one user journey is scattered across
  unrelated route branches or folders, such as onboarding logic split across
  `signup`, `settings`, `profile`, and `team`. Agent value: adds
  `related_files` context for changes that otherwise look local but are
  really journey-wide.
- **Action Label Drift:** the same action or object is labelled differently
  across UI copy and code, such as "Delete", "Remove", and "Archive" for
  the same operation, or "User", "Member", and "Seat" for the same actor.
  Agent value: catches semantic drift that often precedes duplicated
  conditional logic and inconsistent UX.
- **Permission IA Drift:** navigation, route guards, docs, and policy code
  describe access using different roles or concepts. Example: nav visible
  to `admin`, route guarded by `owner`, UI says "Team settings", and code
  checks `organization.manage`. Agent value: highlights auth vocabulary
  mismatches before a change leaks or hides product areas.

Initial IA detector priority, if this track is promoted:

1. **Concept Alias Drift** — highest differentiation and directly supports
   source-of-truth discovery.
2. **Route Metadata Drift** — concrete, evidence-backed, and easy to explain
   in PR comments.
3. **Duplicated Navigation Source** — likely low-noise in apps with route
   config or sidebar arrays.
4. **Orphaned Destination** — useful cleanup signal once route discovery is
   mature.
5. **Parallel Destination** — high value, but probably needs near-duplicate
   name / route / component-shape scoring to avoid noisy guesses.

### Distribution (later)

- Homebrew tap and standalone binaries (M6) — deferred until the CLI
  surface stabilises through `0.2.0` and `0.3.0`.

---

## Why this slice for 0.2.0

In rough leverage order — these unlock the most product value once
`crimes scan` is in users' hands:

1. **`crimes diff base...HEAD` + baseline (M4)** so CI can fail only on
   **new** high findings without drowning teams in legacy debt. This was
   the single highest-impact feature still missing from the PRD's M4
   bundle, and the one most CI integrations were waiting on.
2. **`crimes verdict`** because it turns the same diff signal into a
   one-line "did this branch help or hurt?" answer that fits a PR
   comment or an agent's end-of-task summary.
3. **`crimes scan --changed --fail-on`** — the cheapest CI gate, narrow
   by design, useful in repos that already have zero findings or in
   agent loops that want to fail fast on their own diff.
4. **CI docs** because shipping the gating commands without a copy-paste
   GitHub Actions recipe leaves users to guess at the integration.
5. **Schema / report consistency pass** so the new on-disk artefact
   (`.crimes/baseline.json`) and the new `VerdictReport` / `DiffReport`
   shapes carry the same `schema_version` and a `report_type`
   discriminator from day one — stable contract discipline.

After `0.2.0`, the next bottleneck shifts back to **detector signal**: the
richer per-finding scores and cross-file relationships that `0.3.0`
targets.
