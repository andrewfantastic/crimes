# Roadmap status

Snapshot of the repo against the PRD milestones (`PRD.md` §22). Updated as
work lands. Authoritative spec stays in `PRD.md` — this file is a status
mirror, not a planning doc.

- **Last published version:** `crimes@0.1.0` (npm, 2026-05-15) ✅ shipped
- **Release candidate on `main`:** `crimes@0.2.0` — _branch and PR safety
  for humans and coding agents_. `packages/cli/package.json` is bumped;
  smoke test + verification pass. Awaiting the GitHub Release that will
  fire [`.github/workflows/release.yml`](./.github/workflows/release.yml).
- **Published package:** [`crimes`](https://www.npmjs.com/package/crimes)
  on npm — `npm install -g crimes` and `npx crimes scan .` both work today.
- **Website:** [crimes.sh](https://crimes.sh) — live, deployed from this
  monorepo via Vercel (auto-deploys on push to `main`).
- **Repository:** [`andrewfantastic/crimes`](https://github.com/andrewfantastic/crimes).

| Milestone                     | Status                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| M0 — Repo foundation          | ✅ done (shipped in 0.1.0)                                                              |
| M1 — First working CLI        | ✅ done (shipped in 0.1.0)                                                              |
| M2 — Risk model               | 🟡 partial — `crimes hotspots` shipped; per-finding `scores.churn` / `test_gap` pending |
| M3 — Agent context            | 🟡 partial — `crimes context` + `AGENTS.md` + Claude skill shipped                       |
| M4 — Diff and CI              | 🟢 0.2.0 RC — `scan --changed [--base]` ✅, `scan --changed --fail-on` ✅, `diff` ✅, `baseline save` / `baseline check` ✅, `verdict` ✅, [`docs/ci.md`](./docs/ci.md) + [GitHub Actions example](./examples/github-actions/crimes.yml) ✅. `diff --fail-on new-high` and per-finding ignore/suppressions deferred to **0.3.0**. |
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

## 🟢 Release candidate — `crimes@0.2.0`

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

### Deferred from `0.2.0`

The following are explicitly **not in `0.2.0`** and are tracked for later
versions. Don't document them as shipped.

- **`crimes diff --fail-on new-high`** — exit non-zero when the head ref
  introduces any new `severity: "high"` finding. Deferred to `0.3.0`.
  Until then, gate on JSON (`jq -e '.summary.new == 0'`) or use
  `crimes verdict --fail-on new-high` / `crimes scan --changed --fail-on
  high` / `crimes baseline check`.
- **`crimes ignore <id>`** + `.crimes/suppressions.json` per-finding
  suppressions — deferred to `0.3.0`. The baseline workflow covers the
  "don't fail on legacy debt" use case for `0.2.0`.
- **`crimes explain <id>`** — long-form per-finding rationale. Deferred
  to `0.3.0`.
- **`crimes init` + config plumbing** — bootstrap a `crimes.config.json`
  with sensible architecture rules. Deferred to `0.3.0`.
- **`crimes ask` / LLM-assisted modes** — `v1+`.
- **Dependency-graph detectors** — circular dependencies, deep imports,
  layer violations driven by `architecture.layers` config. `0.4.0+`.
- **Duplication detectors** — exact and near-duplicate blocks, repeated
  string literals, duplicated role / status / plan checks. `0.4.0+`.
- **Homebrew tap + standalone macOS / Linux / Windows binaries** —
  deferred until the CLI surface stabilises (post-`0.3.0`).

---

## 🎯 Next target — `crimes@0.3.0`

**Theme: information architecture crimes.**

> **Implementation plan: [`IA_CRIMES_PLAN.md`](./IA_CRIMES_PLAN.md).**
> Detector taxonomy, scope recommendation, IA-index architecture,
> extraction strategy, fixture plan, sequencing, and success criteria
> for `0.3.0` live there. This section is the headline summary; the
> plan is the build doc.

`0.2.0` made `crimes` useful for branches, PRs, CI, and agent loops —
the change-set surface is now covered. `0.3.0` should make `crimes`
better at detecting **repo structure drift that confuses humans, coding
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

The detectors below are headline candidates. They share two properties
that line up with the `crimes` thesis: every finding is evidence-backed
(file paths, route strings, identifiers, label literals — no opinion),
and every finding makes the repo safer to edit by a human or an agent.
See the [Information architecture risk candidates](#information-architecture-risk-candidates)
section below for the long-form descriptions and agent-value notes.

### Likely 0.3.0 candidate slice — IA crimes

- **Concept Alias Drift** — the same domain concept appears under
  multiple names across identifiers, routes, headings, translation keys,
  constants, docs, and tests (`organization` / `workspace` / `team` /
  `account`; `plan` / `tier` / `subscription` / `package`). Highest
  differentiation and the foundation for the rest of the IA track.
- **Route Metadata Drift** — route paths, nav labels, page titles,
  breadcrumbs, component names, and file names disagree for the same
  destination. Concrete and easy to explain in a PR comment.
- **Duplicated Navigation Source** — nav arrays, route registries,
  breadcrumbs, sitemap metadata, and sidebar definitions repeat the same
  destination data in multiple files; agents updating one copy miss the
  others.
- **Orphaned Destination** — page / route / screen files exist but are
  not reachable from primary navigation, route registries, sitemap
  metadata, or internal links. Useful cleanup signal once route
  discovery is mature.
- **Parallel Destination** — multiple pages or flows appear to serve the
  same user intent (`/billing`, `/settings/billing`, and
  `/account/subscription`; `InviteUserModal` and `AddTeamMemberDialog`).
  Forces a source-of-truth decision before another parallel
  implementation is extended.
- **Permission IA Drift** _(if feasible in the same slice)_ —
  navigation, route guards, docs, and policy code describe access using
  different roles or concepts. High-value but probably needs route /
  policy / nav discovery from the earlier detectors before it can run.

The detector core and finding schema are already language-agnostic; the
IA detectors should produce the same `Finding` shape (with new `type`
values) and ride the existing scan / diff / baseline / verdict / context
plumbing without schema churn. The new `type` values are additive under
the current `schema_version` discipline.

### Supporting / later candidates

These are still useful and are tracked, but they are no longer the
headline `0.3.0` theme. They land alongside the IA slice if they
explicitly support it, otherwise they slip to `0.3.x` / `0.4.0`.

- **Cross-file `related_files`** — populate the schema-reserved field
  with the routes, nav files, label sources, and parallel destinations
  that the IA detectors already need to discover. Directly supports IA
  findings (and incidentally backfills M3).
- **Richer per-finding scores (M2):** `scores.churn`,
  `scores.test_gap`, and `scores.blast_radius` on every finding. Useful
  for ranking IA findings (a `Concept Alias Drift` across high-churn
  files matters more than one across docs), but secondary to shipping
  the IA detectors themselves.
- **`crimes explain <id>`** — long-form per-finding rationale (M3). IA
  findings benefit from this more than structural ones because the "so
  what" is less obvious.
- **`crimes ignore <id>`** + `.crimes/suppressions.json` (M4 polish) —
  per-finding suppressions to complement the repo-wide baseline. Pairs
  naturally with IA detectors, which will sometimes flag legitimate
  alias choices that the team has accepted.
- **`crimes diff --fail-on new-high`** — finish the M4 CI-gate trio so
  `diff` matches `verdict` and `baseline check`.
- **`crimes init` + config plumbing** — bootstrap a `crimes.config.json`
  with sensible architecture rules so the layer-violation detector can
  ship in `0.4.0`. Only pulled into `0.3.0` if the IA detectors need
  declared route / nav locations beyond what convention-based discovery
  finds.

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
