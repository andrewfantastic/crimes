# `crimes@0.5.0` — Suppressions, Config, and Explainability

Implementation plan for the next release. Nothing here ships until a
follow-up branch implements it. The authoritative spec stays `PRD.md`;
the live milestone tracker stays `ROADMAP_STATUS.md`; this file is the
0.5.0 plan handed to the implementation agents.

- **Repo state at planning time:** `crimes@0.4.0` (agent context quality
  and signal-to-noise) shipped to npm and `main`. CLI surface:
  `scan`, `scan --changed [--base] [--fail-on]`, `context`, `hotspots`,
  `diff`, `baseline save/check`, `verdict`. Detectors: structural
  (`large_function` with shape-aware thresholds, `large_file`,
  `todo_density`, `direct_date`) + petty (8) + IA (5). Schema:
  `schema_version: "0.1.0"`.
- **Constraint:** do not change shipped CLI behaviour incompatibly, do
  not bump the package version, do not edit the website yet. This plan
  describes the work; a follow-up implementation pass writes the code.

The previous 0.5.0 tentative theme was _suppressions and config_. After
0.4.0's noise-reduction pass, the demand for blanket suppressions has
dropped — but the demand for **deliberate, reviewable per-finding
exceptions plus a config story plus an explain command for the agent
loop** is still real. The three concerns are tightly coupled, which is
why they cluster into one release.

---

## 1. Product framing

**Recommended `0.5.0` theme: _suppressions, config, and explainability —
the three things that turn `crimes` into a tool teams adopt instead of
fight._**

Three problems have grown louder as `crimes` matured through `0.2.0` →
`0.4.0`. Each one looks small in isolation; together they form the next
adoption gate.

### 1.1 Teams need to adopt `crimes` without fighting legitimate exceptions

`crimes` is already low-noise on default settings — the 0.4.0 work made
sure of that. But "low-noise" is not "zero-noise on this specific repo".
Real repos always have a small set of findings the team has decided are
fine: a vendored file that scores high on `large_file`, a route
handler the team agreed to keep monolithic, an alias the team
deliberately maintains for backwards compatibility. Without
suppressions, those findings either:

1. Permanently inflate every report, training agents and humans to skim
   past the top of the list, or
2. Force the team to disable a detector wholesale — which removes the
   signal everywhere it would have been useful.

The baseline workflow (`crimes baseline save / check`) partially solves
this for legacy debt, but baselines are repo-wide and forward-only.
They don't give the team a way to say "this _specific_ finding is
acceptable, here is _why_, and please keep blocking new findings of
the same type elsewhere".

### 1.2 IA findings may surface deliberate aliases or compatibility shims

`concept_alias_drift` is the most likely IA detector to fire on
intentional ambiguity. A repo might genuinely have both `account` and
`workspace` because they are two real concepts in the product. A repo
might deliberately keep both `team` and `organization` as compatibility
shims while a migration is in flight. `route_metadata_drift` can fire
on a legitimate route that has different display titles in different
contexts.

These are exactly the cases where the detector is _correctly identifying
ambiguity that the team has deliberately chosen to live with_. The
right answer is not "raise the threshold" — that hides the signal
everywhere — but "let the team document this specific decision in the
repo, in a file that survives review and shows up in diffs". That is
what a suppressions file is.

### 1.3 Config lets repos define their own boundaries and vocabulary

`crimes.config.json` already exists as a partial shape (include /
exclude / thresholds) but is barely used because there's no surface for
the things teams most want to configure:

- The IA `concept_alias_drift` detector ships with a fixed seed list
  (`team`/`workspace`/`org`, etc.). Real teams have product-specific
  vocabulary they want to seed (e.g. `dataset`/`corpus`/`collection`).
- Shape-aware `large_function` thresholds are fixed at runtime (60 /
  200 / 100 / 200 / 200 / 80). Teams running on conventions different
  from Next.js / Vitest don't have a way to tune them.
- Some detectors are wrong for some repos (e.g. `todo_density` on a
  research codebase where TODO is a tracking convention, not debt).
  Teams need a way to disable specific detectors per-repo without
  forking the binary.

Config is the lever that makes detection match a team's actual policy.
Without it, every team has to choose between accepting the defaults or
fighting them.

### 1.4 `crimes explain` helps humans and agents understand a finding before suppressing or fixing it

The current flow forces an agent or human into a binary: see a finding,
either fix the code or suppress the finding. Neither path benefits from
asking _why is this a problem in the first place?_ — the summary line
is short by design, and the evidence list is factual but un-rationalised.

`crimes explain <id>` is the missing rung between "I see the charge" and
"I commit to fix or suppress". It should answer:

- What does this detector look for, and why?
- What concrete evidence triggered it on this file?
- What is the recommended fix, with the cheapest first?
- What other files are related to this finding?
- How do I suppress this finding, with a reason that survives review?

That last bullet is the critical link: `explain` is what makes
suppressions deliberate. An agent or human who runs `crimes explain
crime_00005` before running `crimes ignore` has already considered the
fix path; the suppression is then a documented choice, not a reflex.

### 1.5 Suppressions should be deliberate, reviewable, and evidence-backed

The biggest risk in this release is that suppressions become a dumping
ground — a "shut this thing up" file that grows over time and quietly
swallows signal the team would have wanted to act on. Three properties
of the suppression workflow have to make that hard:

1. **`reason` is required.** No suppression without a sentence
   explaining why. The CLI refuses to write an entry without one. This
   is the single biggest correctness lever — it forces the team to
   articulate the exception every time.
2. **Suppressions live in `.crimes/suppressions.json`, intended to be
   committed, and human-reviewable in PRs.** The file format is JSON
   (the same contract as `.crimes/baseline.json`) so a code reviewer
   can scan a diff and see "this PR adds a suppression on
   `route_metadata_drift::src/routes/admin/users.tsx::AdminUsers`
   with reason: 'temporary, see #1234'".
3. **Suppressed findings are not deleted — they are filtered with a
   counter.** Every report carries a `suppressed_count` when at least
   one suppression matched. `--show-suppressed` displays them with
   `suppressed: true` and `suppression_reason`. The team and any
   auditor can always re-surface what was hidden.

### Why these three together

Suppressions without config means every team's IA detector ships with
the same seed list. Config without explainability means teams configure
in the dark. Explainability without suppressions means agents have no
"yes, I considered this and decided to live with it" exit. Each one
makes the others useful; shipping any one alone would feel half-built.

The wedge is unchanged: deterministic, local, JSON-first, no LLM. This
release strengthens it by giving teams the levers they need to make
the default signal match their actual policy.

---

## 2. `0.5.0` release goal

> **`crimes@0.5.0` lets teams customise, explain, and intentionally
> suppress findings without weakening the default signal.**

By the end of `0.5.0`, all of these must be true:

1. **Config plumbing is real.** `crimes.config.json` carries the
   detector-relevant knobs that teams need: per-detector enable/disable,
   per-shape `large_function` thresholds, IA alias group overrides, a
   reserved `architecture.layers` placeholder, and a suppressions path.
   `crimes init` bootstraps a sensible starter file.
2. **Suppressions are deliberate and reviewable.** `crimes ignore
   <fingerprint> --reason "..."` writes to
   `.crimes/suppressions.json`. The file is JSON-schema-validated, the
   reason is required, and the file is intended to be committed.
3. **Suppressions apply consistently.** `scan`, `context`, `baseline
   check`, `diff`, and `verdict` all filter suppressed findings out of
   the default view, expose them under `--show-suppressed`, and never
   trip a `--fail-on` gate on a suppressed finding.
4. **`crimes explain` answers the next question after `crimes scan`.**
   `crimes explain <id-or-fingerprint>` produces a deterministic,
   evidence-backed long-form rationale, including a suggested
   suppression command if the team decides not to fix.
5. **`crimes diff --fail-on new-high` completes the M4 CI gate trio.**
   The remaining unshipped flag finally lands.
6. **Schema unchanged where possible.** All additions are optional /
   additive — no `schema_version` bump.
7. **No new detectors ship.** Same constraint as 0.4.0: this is a
   product-surface release, not a detector release.
8. **No LLM, no cloud, no API key.** Same wedge as before.

Out of scope for `0.5.0`: per-finding `scores.churn` /
`scores.test_gap` / `scores.blast_radius` (M2 work, still touches every
detector); `architecture.layers` _runtime enforcement_ (config schema
ships, dependency-graph detector does not); `crimes ask` (v1+);
Homebrew / standalone binaries (M6).

---

## 3. Proposed features (evaluation)

### A. `crimes init` — bootstrap `crimes.config.json`

**Recommendation: must-ship.**

The simplest possible scaffold. Writes a starter `crimes.config.json`
to the cwd with:

- `$schema` URL pointing at `https://crimes.sh/schema/0.1.0/config.json`
  (hosted later; the URL is reserved now even if it 404s — IDE
  validation works the moment it's hosted).
- `include` / `exclude` (defaults, commented to make tweaks obvious).
- `thresholds` (the existing keys, with a commented note linking to the
  per-shape overrides).
- An empty `ia.aliasGroups` array with one commented example.
- A reserved `architecture.layers` placeholder marked _"unused in
  0.5.0; will drive layer-violation detection in a future release"_.

Behaviour:

- Refuses to overwrite an existing `crimes.config.json` unless `--force`
  is passed. Exits `2` with a clear error otherwise.
- Writes alongside (not inside) `.crimes/` — the config is a
  user-edited file; `.crimes/` is a tooling output directory.
- Prints a one-line summary on success: `Wrote crimes.config.json (n
  lines). Tweak include/exclude/thresholds and commit.`
- Always exits `0` on success.

Out of scope:

- Interactive prompts. `crimes init` is non-interactive — opinionated
  defaults, edit afterwards.
- Detecting framework conventions and tailoring the output. Future
  release; the starter file's comments tell users what to tweak.

### B. Config loading — extend `CrimesConfig`

**Recommendation: must-ship.**

Today's `CrimesConfig` is:

```ts
{
  include: string[];
  exclude: string[];
  thresholds: { largeFileLines, largeFunctionLines, todoDensityPerKLoc };
}
```

Add optional, backwards-compatible fields:

```ts
{
  // existing keys unchanged
  include?: string[];
  exclude?: string[];
  thresholds?: {
    largeFileLines?: number;
    largeFunctionLines?: number;       // still the `domain` shape default
    todoDensityPerKLoc?: number;
    // NEW: per-shape large_function overrides
    largeFunction?: {
      domain?: number;
      route_handler?: number;
      react_component?: number;
      page_export?: number;
      test_callback?: number;
      unknown?: number;
    };
  };
  // NEW: IA seed overrides
  ia?: {
    aliasGroups?: Array<{
      id: string;            // stable identifier, e.g. "tenant"
      aliases: string[];     // ["team", "workspace", "organization"]
    }>;
  };
  // NEW: detector toggles
  detectors?: {
    enable?: string[];       // explicit allowlist; empty/omitted = all
    disable?: string[];      // explicit blocklist; runs after `enable`
  };
  // NEW: suppression file path override
  suppressions?: {
    path?: string;           // default ".crimes/suppressions.json"
  };
  // NEW: reserved placeholder, schema-validated but unused in 0.5.0
  architecture?: {
    layers?: Array<{ name: string; pattern: string }>;
    rules?: Array<{ from: string; cannotImport: string[] }>;
  };
}
```

Implementation notes:

- Use `zod` for validation (already a stack decision in `CLAUDE.md` /
  `PRD.md` §12.4). A malformed config produces a single human-readable
  error and exits `2` from the CLI; the core `loadConfig` returns
  `DEFAULT_CONFIG` plus the validation error so the CLI can decide how
  to surface it.
- `ia.aliasGroups` is **additive** to the built-in `DEFAULT_ALIAS_GROUPS`
  (see `packages/core/src/ia/aliases.ts`) by default. A future
  `ia.aliasGroupsReplace: true` opt-in could replace the built-in list
  — defer until requested.
- `detectors.enable` / `disable` operate on the detector `id` strings
  (`large_function`, `concept_alias_drift`, etc.). The `scan` /
  `context` engines apply the filter when assembling
  `options.detectors` from `builtInDetectors`.
- `thresholds.largeFunction.<shape>` overrides flow into the existing
  `policyFor()` helper in
  `packages/core/src/detectors/large-function.ts`. The current
  top-level `thresholds.largeFunctionLines` continues to mean "domain
  threshold" for backwards compatibility, and the new
  `thresholds.largeFunction.domain` wins when both are set.
- `architecture` is **parsed and validated but not consumed**. Document
  it as reserved. The shape mirrors `PRD.md` §18 verbatim so the
  eventual implementation doesn't have to rev the schema again.

### C. `crimes explain <id-or-fingerprint>`

**Recommendation: must-ship.**

Resolves a finding identity to a long-form, deterministic explanation.
Two sources of input:

- `--from <scan.json>` — read a previously-saved `ScanReport`.
- (default) — re-run `crimes scan` against the cwd, then look up.

If `<id-or-fingerprint>` matches a finding's `id` (`crime_00005`) or
its stable `fingerprint` (`large_function::src/billing.ts::generateInvoice`),
return the explanation. Multiple matches (same fingerprint, multiple
scans piped in) collapse to the first.

Output (human, JSON via `--format json`):

```
CRIMES EXPLAIN
charge:    God Function
type:      large_function
severity:  high   confidence: 0.95
file:      src/billing.ts
symbol:    generateInvoice
lines:     37–240

What this detector looks for
  Functions whose body exceeds a per-shape line threshold. Domain
  functions get the configured `thresholds.largeFunction.domain`
  budget (default 60); React components, route handlers, page
  exports, and test callbacks each carry their own.

Why it matters
  Functions this large usually mix unrelated responsibilities. An
  agent editing one section often misses interactions in another,
  and the function becomes a magnet for further duplication.

Evidence
  · lines 37–240 (204 lines)
  · 3.4× the domain function threshold (60 lines)
  · function declaration

Suggested actions
  · extract_function (risk: low)
      Extract cohesive sections into named helpers — start with the
      pure calculations.

Related files
  · src/billing.test.ts   — likely_tests passthrough
  · src/billing.helpers.ts — shares directory

To suppress (only if the team has decided this is acceptable)
  crimes ignore large_function::src/billing.ts::generateInvoice \
    --reason "Legacy billing module, rewrite tracked in #1234"
```

JSON shape (new report type, additive):

```ts
interface ExplainReport {
  schema_version: "0.1.0";
  report_type: "explain";
  finding: Finding;                  // verbatim from the scan
  detector: {
    type: string;                    // e.g. "large_function"
    charge: string;                  // e.g. "God Function"
    description: string;             // from Detector.description
  };
  why_it_matters: string;            // per-detector, short paragraph
  suggested_suppression_command: string;
}
```

**Why deterministic, no LLM.** The `why_it_matters` text is a fixed
per-detector string baked into the core package — same lookup table
shape as the existing `GUIDANCE` map in
`packages/core/src/context.ts`. The detector description is already
on every `Detector` object. Suggested actions come verbatim from the
finding. Nothing is generated; everything is looked up.

### D. `crimes ignore <fingerprint-or-id> --reason "..."`

**Recommendation: must-ship.**

Writes (or updates) `.crimes/suppressions.json`. Arguments:

- `<fingerprint-or-id>` — accepts either the stable fingerprint
  (`large_function::src/billing.ts::generateInvoice`) or a per-scan id
  (`crime_00005`). When given an id, resolve to a fingerprint by
  running a scan and looking it up. Persist by fingerprint — _never_
  by id, because ids are per-scan transient.
- `--reason "..."` — required. The command exits `2` if it's missing
  or empty.
- `--file <path>` — optional override; defaults to
  `.crimes/suppressions.json` (or `config.suppressions.path` when
  set).

Behaviour:

- Loads existing suppressions if the file exists; appends or updates.
- Re-suppressing the same fingerprint with a new reason updates the
  entry's `reason` and `updated_at`. The CLI prints a one-line notice
  saying it was updated, not added.
- Writes JSON pretty-printed (2-space indent) so diffs are reviewable.
- Prints one line on success: `Suppressed large_function::… in
  .crimes/suppressions.json. Commit the file so the suppression
  survives review.`
- Always exits `0` on success, `2` on a missing reason / invalid
  fingerprint / unknown id.

Deliberately **deferred** for 0.5.0:

- **Expiry (`expires_at`).** Useful, but adds non-trivial enforcement
  semantics (does the gate fail when an expired suppression is
  present?). Two viable rules — "expired suppressions are inactive"
  (silently re-surfaces the finding) or "expired suppressions fail
  the gate" (forces revisit). Both are reasonable; punt the choice to
  a 0.6.0 design pass once the team has lived with the basic file
  for a release.
- **Owner (`owner`).** Marginal value vs `created_by` which falls out
  of `git blame` on the file itself. Reviewers already see who
  added the entry in the PR.

### E. Suppression application

**Recommendation: must-ship.**

Suppressions are loaded once per CLI invocation and applied as a
post-processing step on every report. Define a small pure helper:

```ts
function applySuppressions<R extends { findings: Finding[] }>(
  report: R,
  suppressions: SuppressionEntry[],
  options: { showSuppressed: boolean },
): R & { suppressed_count?: number };
```

Semantics:

- A finding matches a suppression entry when `fingerprintFinding(f)`
  equals the entry's `fingerprint`. Same identity function the
  baseline workflow already uses — one source of truth.
- When `showSuppressed: false` (the default), matched findings are
  removed from `findings[]` and `summary` is recomputed.
  `suppressed_count` is added when ≥1 suppression matched. The
  per-severity gate fields (`failed`, `summary.new_by_severity`,
  `summary.new_weighted` on verdict) are computed AFTER suppression —
  so a suppressed finding never trips a `--fail-on` gate.
- When `showSuppressed: true`, matched findings stay in `findings[]`,
  each annotated with `suppressed: true` and `suppression_reason:
  string`. The summary still counts them; gate fields still ignore
  them (the gate semantics are independent of whether the finding is
  displayed).

Apply consistently:

- `crimes scan` and `crimes scan --changed` — yes.
- `crimes context` — yes; suppressions on `Finding`s that anchor to
  the target file are filtered out unless `--show-suppressed`.
- `crimes baseline check` — yes, on the **new** set; suppressions on
  baseline entries themselves are nonsensical (the whole baseline is
  already a "this is fine" snapshot) and a no-op.
- `crimes diff` — yes, on the **new** set; fixed and unchanged sets
  are unaffected.
- `crimes verdict` — yes, via `crimes diff`; gate fields are
  evaluated post-suppression.

JSON contract additions (all optional):

- `Finding.suppressed?: true` (only set when `showSuppressed: true`).
- `Finding.suppression_reason?: string` (paired with the above).
- `ScanReport.suppressed_count?: number` (only when ≥1 suppression
  matched; absent otherwise).
- Same for `ContextReport`, `BaselineCheckReport`, `DiffReport`,
  `VerdictReport`.

### F. `crimes diff --fail-on new-high`

**Recommendation: should-ship (include in 0.5.0).**

Completes the M4 CI-gate trio: `scan --changed --fail-on`, `baseline
check --fail-on`, `verdict --fail-on`, and now `diff --fail-on
new-high`. The implementation is small — `applyDiffFailOn(report,
threshold)` mirrors `applyScanFailOn` and `crimes verdict`'s
`shouldFailVerdict`. The CLI command in
`packages/cli/src/commands/diff.ts` parses the flag, exits `1` when
the threshold is met.

Threshold values match `verdict --fail-on`: `new-high`, `new-medium`.
(No `worse` — `diff` doesn't carry a verdict; that's `verdict`'s
job.) Adding it now lets teams who already use `crimes diff` in CI
upgrade to a gate without switching commands.

Why include despite small surface: it has been deferred since 0.2.0.
The CI documentation already references it as "coming". The remaining
work is so small that excluding it would be perverse.

### G. Per-finding `scores.churn` / `test_gap` / `blast_radius`

**Recommendation: defer.**

M2 work. The scoring contract change touches every detector. Doing it
well requires answering several questions that haven't been settled:

- How is `churn` computed for a multi-finding file? Per-finding or
  per-file?
- How is `test_gap` computed for a function vs a file? What signals
  count as "tested"?
- How does `blast_radius` interact with the current
  `confidence` weighting?

All three deserve their own minor release. Continue to expose them as
**reserved** fields in the schema (they already are — see
`docs/json-schema.md`); document them as "not yet populated".

---

## 4. Recommended scope

### Must ship

The minimum bar for the release. Drop any of these and the theme is
half-built.

1. **Config loader extension** (B). `zod`-validated `CrimesConfig`
   with `ia.aliasGroups`, `thresholds.largeFunction.<shape>`,
   `detectors.enable/disable`, `suppressions.path`,
   `architecture.layers` placeholder.
2. **`crimes init`** (A). Bootstraps `crimes.config.json` with sensible
   defaults and inline comments pointing at the new knobs.
3. **Suppressions file format** (D). On-disk `.crimes/suppressions.json`,
   fingerprint-keyed, `reason` required.
4. **`crimes ignore <fingerprint-or-id> --reason "..."`** (D).
   Persists by fingerprint; id-input resolution via fresh scan.
5. **Suppression application across `scan`, `context`, `baseline check`,
   `diff`, `verdict`** (E). Default-hide with `suppressed_count`;
   `--show-suppressed` opt-in.
6. **`crimes explain <id-or-fingerprint>`** (C). Reads
   `--from <scan.json>` or runs a fresh scan; emits the long-form
   rationale plus the suggested `crimes ignore` command.

### Should ship

Worth doing in 0.5.0 if scope allows. Higher leverage than another
detector but smaller surface than the must-ship items.

7. **`crimes diff --fail-on new-high | new-medium`** (F). Completes
   the M4 trio. Small implementation surface.
8. **`--show-suppressed` flag on `scan`, `context`, `baseline check`,
   `diff`, `verdict`.** Already implied by item 5; surface it
   consistently on every command that lists findings.

### Could ship

If time allows. None of these block the release.

9. **`crimes ignore --dry-run`.** Prints the entry it would write
   without touching the file. Useful in agent loops that want to
   confirm before committing.
10. **Suppression auditing summary in `crimes scan`.** A short
    `(N findings suppressed; run with --show-suppressed to see)` line
    in the human output when `suppressed_count > 0`.
11. **`crimes init --minimal`.** Writes a tiny config with just
    `{ "$schema": "...", "extends": "default" }` (the latter not yet
    implemented, but the marker reserves it). Useful for repos that
    want to declare "we know about crimes" without listing every
    default.

### Defer (out of scope for 0.5.0)

- **Per-finding `scores.churn` / `scores.test_gap` /
  `scores.blast_radius`** (G). M2 work. Defer again.
- **Suppression expiry / owner.** Designed but not built — see §3.D.
  Revisit once teams have lived with the basic file.
- **`architecture.layers` runtime enforcement.** Schema lands now;
  the dependency-graph detector that consumes it is its own release.
- **Detector-level `--severity` overrides in config.** E.g. "demote
  `todo_density` to `low` only in `src/legacy/**`". Would push config
  toward ESLint-style rule-overrides. Wait for explicit demand.
- **`crimes ask` / LLM-assisted modes.** Still `v1+`.
- **Homebrew tap + standalone binaries.** Wait for CLI stability.
- **Interactive `crimes init`.** Non-interactive defaults stay the
  rule; interactivity is a separate UX surface.

**Conservative shape:** must-ship items 1–6 plus should-ship items 7–8
land. Could-ship items only if every must-ship is green and well-tested.

---

## 5. Config design

### Shape

```jsonc
{
  "$schema": "https://crimes.sh/schema/0.1.0/config.json",

  // File discovery (existing keys, optional, fall back to defaults)
  "include": ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.generated.*",
    "**/.crimes/**"
  ],

  // Detector knobs
  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,         // domain default (back-compat)
    "todoDensityPerKLoc": 10,
    // NEW: per-shape overrides; any subset is fine.
    "largeFunction": {
      "domain": 60,
      "route_handler": 100,
      "react_component": 200,
      "page_export": 200,
      "test_callback": 200,
      "unknown": 80
    }
  },

  // Detector toggles (opt-out is the common case; opt-in is rarer)
  "detectors": {
    // Empty / omitted = run every built-in detector.
    "enable": [],
    "disable": ["todo_density"]
  },

  // IA seed overrides — additive to the built-in DEFAULT_ALIAS_GROUPS
  "ia": {
    "aliasGroups": [
      {
        "id": "dataset",
        "aliases": ["dataset", "corpus", "collection"]
      }
    ]
  },

  // Suppressions
  "suppressions": {
    "path": ".crimes/suppressions.json"
  },

  // Reserved — schema-validated but not consumed in 0.5.0.
  "architecture": {
    "layers": [
      { "name": "ui", "pattern": "src/components/**" },
      { "name": "domain", "pattern": "src/domain/**" }
    ],
    "rules": [
      { "from": "domain", "cannotImport": ["ui"] }
    ]
  }
}
```

### Validation (zod)

A single `CrimesConfigSchema` in `packages/core/src/config.ts`. The
existing `loadConfig` returns `DEFAULT_CONFIG` on parse failure today
— preserve that for unknown _keys_ (we silently extend the schema in
future releases without breaking old configs) but **flip to a hard
error for malformed _values_**. The CLI's `runWithConfig` wrapper
prints the error and exits `2`. The core API returns
`{ config: CrimesConfig; issues: ConfigIssue[] }` so a programmatic
consumer can choose what to do.

### Examples

#### Minimal (recommended starter)

```jsonc
{
  "$schema": "https://crimes.sh/schema/0.1.0/config.json"
}
```

Equivalent to the default. The `$schema` URL is the only field that
matters — IDE validation works, future migrations have something to
target.

#### Add a product-specific alias group

```jsonc
{
  "ia": {
    "aliasGroups": [
      { "id": "tenant", "aliases": ["tenant", "company", "org", "organization"] }
    ]
  }
}
```

#### Tune `large_function` for a route-heavy app

```jsonc
{
  "thresholds": {
    "largeFunction": {
      "route_handler": 150
    }
  }
}
```

#### Disable a detector that doesn't apply

```jsonc
{
  "detectors": {
    "disable": ["todo_density"]
  }
}
```

The `disable` array entries are detector `id` strings — same ones used
in `Finding.type`. Document the full list in
`docs/finding-types/index.md` (or whichever index file ships with
0.5.0). Disabling an unknown id is an error (exit 2) — typos should
not silently no-op.

---

## 6. Suppression file design

### Shape (`.crimes/suppressions.json`)

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "suppressions",
  "created_at": "2026-05-17T11:30:00.000Z",
  "updated_at": "2026-05-17T11:30:00.000Z",
  "crimes_version": "0.5.0",
  "suppressions": [
    {
      "fingerprint": "large_function::src/billing.ts::generateInvoice",
      "type": "large_function",
      "file": "src/billing.ts",
      "symbol": "generateInvoice",
      "reason": "Legacy billing module — rewrite tracked in #1234.",
      "created_at": "2026-05-17T11:30:00.000Z",
      "created_by": "andrew@example.com"
    },
    {
      "fingerprint": "concept_alias_drift::src/team/index.ts::",
      "type": "concept_alias_drift",
      "file": "src/team/index.ts",
      "reason": "team and workspace are deliberately both kept for backwards compatibility during the v3 migration.",
      "created_at": "2026-05-17T11:35:00.000Z"
    }
  ]
}
```

### Field semantics

- `schema_version` — matches the global wire-format version. Bumping
  is breaking; consumers refuse unknown values.
- `report_type: "suppressions"` — discriminator, same convention as
  every other on-disk artefact.
- `created_at` / `updated_at` — ISO-8601 timestamps. `created_at` is
  set on first write; `updated_at` is bumped on every modification.
- `crimes_version` — informational. Lets readers see which CLI version
  wrote the file last.
- `suppressions[]` — array of suppression entries.
  - `fingerprint` (required) — stable `<type>::<file>::<symbol>`
    identity. Same function the baseline uses
    (`fingerprintFinding`).
  - `type` / `file` / `symbol` — denormalised copies of the fingerprint
    components. Strictly redundant but **load-bearing for human
    review**: a reviewer scanning `git diff .crimes/suppressions.json`
    can read the entry without parsing the fingerprint.
  - `reason` (required, non-empty) — the team's justification. The
    CLI refuses to write without one.
  - `created_at` (required) — ISO-8601 timestamp.
  - `created_by` (optional) — informational. Default from `git
    config user.email` when available; omit if not.

### Identity choice — fingerprint, type/file/symbol, exact id, or custom matchers?

| Choice | Pros | Cons |
| ------ | ---- | ---- |
| Exact per-scan `id` (`crime_00005`) | Trivially unique. | Re-assigned every scan — useless after the next run. **Disqualified.** |
| Stable fingerprint (`<type>::<file>::<symbol>`) | Same identity already used by `baseline` and `diff`. Survives unrelated edits, line shifts. Reviewable. | Tied to file paths — renames break the suppression (this is the same trade-off as baselines). |
| Separate `type` + `file` + `symbol` fields | Same information, slightly more verbose. | No semantic advantage; just three lookups instead of one. |
| Custom matchers (glob on `file`, regex on `symbol`, etc.) | Powerful — "suppress all `large_function` findings in `src/legacy/**`". | Becomes a mini-language. Hard to review, easy to over-suppress. Adopt only if there's demand after 0.5.0. |

**Recommendation: stable fingerprint.** It's the same identity the
baseline and diff already use, the file format is reviewable, and
file-rename breakage is a feature: a renamed file deserves a fresh
review of whether the suppression still applies. If a team renames
heavily, they'll feel the friction and either re-suppress (with an
updated reason) or fix the underlying issue — both are good outcomes.

Custom matchers (glob/regex) are a tempting power feature. **Defer.**
The on-disk-as-review-artefact discipline is more valuable than
expressive matching in the first release; teams that want broad
"ignore everything in `src/legacy/**`" patterns can already do that
via `config.exclude`.

### What `crimes ignore` writes

The CLI does the minimum:

1. Validate the input fingerprint or resolve an id to one.
2. Read existing suppressions (if any). Validate the file.
3. If an entry with the same fingerprint exists, update `reason` and
   `updated_at`. Else append a new entry.
4. Update top-level `updated_at`.
5. Write back JSON pretty-printed with 2-space indent and trailing
   newline (so `git diff` is friendly).

`crimes ignore` does NOT delete entries. A future `crimes unignore`
or hand-editing the JSON covers removal — the file is intended to be
hand-reviewable.

---

## 7. Explain command design

### Recommended CLI surface

```
crimes explain <id-or-fingerprint> [--from <scan.json>] [--format human|json]
```

Two input modes:

| Mode | Behaviour |
| ---- | --------- |
| `--from <scan.json>` | Read the scan, look up by `id` or `fingerprint`. Doesn't run a scan. Fast. |
| (default) | Run `scan({ root: cwd })`, then look up. Slower but standalone — agents and humans can invoke without setup. |

The `crimes scan -f json > scan.json && crimes explain crime_00005
--from scan.json` workflow is the canonical agent pattern (the scan
result is already in their context anyway). The default mode covers
the casual `crimes explain large_function::src/billing.ts::generateInvoice`
invocation a human types into a terminal.

### Why this shape, not the others

| Option | Verdict |
| ------ | ------- |
| `crimes explain <fingerprint>` only — no id support | Hurts the casual `crimes scan` → "what's crime_00005?" path. The fingerprint is long and tedious to type. **Reject.** |
| `crimes explain <id>` only — no fingerprint support | Forces every invocation to scan first to derive the id. **Reject.** |
| `crimes explain <id>` defaulting to "latest scan from `.crimes/last-scan.json`" | Adds a new on-disk artefact and a new failure mode. Better to make `--from` explicit. **Reject.** |
| `crimes explain <file>` — file-level explanation | That's `crimes context <file>`. Don't duplicate. **Reject.** |
| `crimes explain <id-or-fingerprint> [--from <scan.json>]` (recommended) | Covers both casual and agent use; minimal new surface; no on-disk side effects. **Adopt.** |

### Output shape

Human (default):

```
CRIMES EXPLAIN
charge:    God Function
type:      large_function
severity:  high   confidence: 0.95
file:      src/billing.ts
symbol:    generateInvoice
lines:     37–240

What this detector looks for
  ...

Why it matters
  ...

Evidence
  · ...

Suggested actions
  · ...

Related files
  · ...

To suppress (only if the team has decided this is acceptable)
  crimes ignore <fingerprint> --reason "<one-sentence justification>"
```

JSON (`--format json`):

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "explain",
  "finding": { /* same Finding shape as crimes scan */ },
  "detector": {
    "type": "large_function",
    "charge": "God Function",
    "description": "Flags functions whose body exceeds a per-shape line threshold ..."
  },
  "why_it_matters": "Functions this large usually mix unrelated responsibilities ...",
  "suggested_suppression_command": "crimes ignore large_function::src/billing.ts::generateInvoice --reason \"<one-sentence justification>\""
}
```

### Where the strings come from

- `detector.description` — already on every `Detector` object.
- `why_it_matters` — new fixed table in
  `packages/core/src/detectors/<type>.ts`, mirroring the existing
  `GUIDANCE` map in `packages/core/src/context.ts`. Each detector
  exposes a static `whyItMatters: string` field. Default
  `whyItMatters: ""` is acceptable for unknown types — `crimes
  explain` displays "(no rationale text for this detector)" and
  doesn't crash.
- `suggested_suppression_command` — built from the finding's
  fingerprint.

No LLM, no network. Same wedge.

---

## 8. JSON schema implications

All additions are **optional and additive**. No `schema_version` bump.

### Per-finding

```ts
interface Finding {
  // ... existing fields unchanged
  suppressed?: true;                 // only set when --show-suppressed
  suppression_reason?: string;       // paired with `suppressed`
}
```

### Per-report (every report that lists findings)

```ts
interface ScanReport       { /* + */ suppressed_count?: number }
interface ContextReport    { /* + */ suppressed_count?: number }
interface BaselineCheckReport { /* + */ suppressed_count?: number }
interface DiffReport       { /* + */ suppressed_count?: number }
interface VerdictReport    { /* + */ suppressed_count?: number }
```

`suppressed_count` is set only when ≥1 suppression matched in this
invocation. Absent otherwise (so JSON consumers can't tell the
difference between "no suppressions configured" and "0 matched" —
they're equivalent for downstream).

### New report types

```ts
interface ExplainReport {
  schema_version: "0.1.0";
  report_type: "explain";
  finding: Finding;
  detector: { type: string; charge: string; description: string };
  why_it_matters: string;
  suggested_suppression_command: string;
}

interface Suppressions {
  schema_version: "0.1.0";
  report_type: "suppressions";
  created_at: string;            // ISO-8601
  updated_at: string;            // ISO-8601
  crimes_version?: string;
  suppressions: SuppressionEntry[];
}

interface SuppressionEntry {
  fingerprint: string;
  type: string;
  file?: string;
  symbol?: string;
  reason: string;
  created_at: string;            // ISO-8601
  created_by?: string;
}
```

### Diff gate fields

```ts
interface DiffReport {
  // ... existing
  fail_on?: "new-high" | "new-medium";
  failed?: boolean;
}
```

Mirrors `ScanReport.fail_on / failed`. Absent when `--fail-on` is not
passed.

### Stability

The four optional `*Report.suppressed_count` fields and the two
optional `Finding.suppressed` / `suppression_reason` fields all fall
under the documented stability guarantee for optional additive
fields. Consumers reading by key name (the documented pattern) are
unaffected.

Document each addition in `docs/json-schema.md` under the relevant
report. Reserve `report_type: "explain"` and `report_type:
"suppressions"` in the discriminator table.

---

## 9. CI implications

Suppressions apply BEFORE every `--fail-on` evaluation. This is the
critical contract for CI integration — a suppressed finding never
trips a gate, regardless of severity.

### Per-command behaviour

#### `crimes scan --changed --fail-on <severity>`

- Load suppressions.
- Run scan (changed-files filtered).
- Apply suppressions (filter from `findings`, recompute `summary`).
- Apply `--fail-on` to the filtered set.
- Exit `1` only if a NON-suppressed finding meets the threshold.

#### `crimes baseline check --fail-on <severity>`

- Load baseline + suppressions.
- Run scan.
- Classify against baseline (new / fixed / unchanged).
- Apply suppressions to the **new** set only.
- Apply `--fail-on` to the suppressions-filtered new set.

Suppressions and baselines are orthogonal but composable. The team
typically commits both files and gets:

- "Old debt (in baseline) doesn't block CI"
- "Specific exceptions (in suppressions) don't block CI either, with a
  documented reason"
- "Everything else does"

#### `crimes verdict [--fail-on worse | new-high | new-medium]`

- Load suppressions.
- Run `diff` against the base (already does this).
- Apply suppressions to the **new_findings** set.
- Recompute `summary.new_by_severity` and `summary.new_weighted` from
  the filtered set.
- Evaluate `--fail-on` against the filtered set.

#### `crimes diff <base...head> [--fail-on new-high | new-medium]`

- Same as verdict, applied to the diff itself.

#### `crimes scan` (no `--changed`, no `--fail-on`)

- Advisory. Apply suppressions; show `suppressed_count` in summary;
  filter from output unless `--show-suppressed`.

### Documentation

Update `docs/ci.md` to add a short subsection per gating mode:

> ### Suppressions and this mode
>
> Suppressions in `.crimes/suppressions.json` are applied before the
> `--fail-on` check. A suppressed finding will not flip `failed` to
> true, regardless of severity. The suppressed count is surfaced in
> JSON output (`suppressed_count`); use `--show-suppressed` to see the
> matched findings.

Add a new section "Suppressions vs baselines" near the top of
`docs/ci.md` so adopters understand the difference before they have
to choose.

---

## 10. Tests and fixtures

Every new behaviour gets a unit test in the closest existing test
file, plus an integration test in `packages/cli/src/commands/*.test.ts`.

### Config loading (`packages/core/src/config.test.ts` — new file)

1. Default config returned when no `crimes.config.json` exists.
2. Malformed JSON exits with a `ConfigParseError` (exit 2 from the CLI).
3. Unknown top-level keys are preserved and ignored (forward compat).
4. `thresholds.largeFunction.<shape>` overrides feed through to the
   detector — assert via a small fixture function.
5. `ia.aliasGroups` overrides merge with built-in
   `DEFAULT_ALIAS_GROUPS` (assert both seed and override fire).
6. `detectors.disable` removes a detector from the run.
7. `detectors.enable` with a non-empty list runs only those detectors.
8. `detectors.disable` with an unknown id exits 2.
9. `suppressions.path` override is honoured.

### `crimes init` (`packages/cli/src/commands/init.test.ts` — new file)

1. Writes `crimes.config.json` when none exists.
2. Refuses to overwrite without `--force` (exit 2).
3. With `--force`, replaces the file.
4. Written file passes `loadConfig` validation (round-trip).

### Suppressions read/write (`packages/core/src/suppressions.test.ts` — new file)

1. `loadSuppressions` returns an empty list when the file is missing.
2. `loadSuppressions` round-trips a valid file.
3. Malformed file throws `MalformedSuppressionsError` (the CLI maps to
   exit 2).
4. `appendSuppression` adds a new entry and bumps `updated_at`.
5. `appendSuppression` on an existing fingerprint updates `reason` and
   `updated_at`, not `created_at`.
6. `applySuppressions(report, [], { showSuppressed: false })` is the
   identity.
7. `applySuppressions(report, [match], { showSuppressed: false })`
   removes matching findings and sets `suppressed_count`.
8. `applySuppressions(report, [match], { showSuppressed: true })` keeps
   matching findings annotated.
9. Gate fields (`failed`, `summary.high/medium/low`) reflect the
   suppression-filtered set.

### `crimes ignore` (`packages/cli/src/commands/ignore.test.ts` — new file)

1. Missing `--reason` exits 2.
2. Empty `--reason ""` exits 2.
3. Valid fingerprint writes the file.
4. Valid `crime_NNNNN` id resolves via a fresh scan, then writes the
   file with the fingerprint.
5. Re-ignoring the same fingerprint updates the entry, doesn't append.
6. `--file <path>` override honoured.

### `crimes explain` (`packages/cli/src/commands/explain.test.ts` — new file)

1. `--from scan.json` resolves a finding by id.
2. `--from scan.json` resolves a finding by fingerprint.
3. Default mode runs a fresh scan and resolves correctly.
4. Unknown id / fingerprint exits 2.
5. JSON output matches the `ExplainReport` shape.
6. Human output contains the suggested `crimes ignore` command line.

### CI gating respects suppressions

Add to existing `packages/cli/src/commands/scan.test.ts`,
`baseline.test.ts`, `verdict.test.ts`, `diff.test.ts`:

1. `crimes scan --changed --fail-on high` with a suppression on the
   only high finding exits 0.
2. `crimes baseline check --fail-on medium` with a suppression on the
   only new medium finding exits 0.
3. `crimes verdict --fail-on new-high` with a suppression on the only
   new high finding exits 0.
4. `crimes diff --fail-on new-high` (new flag) — basic case plus the
   suppression case.

### Fixture extension

Extend `examples/messy-ts-app` with:

- A `.crimes/suppressions.json` containing one entry — the
  `generateInvoice` God Function — with a reason like
  `"Demonstration of the suppressions workflow. See
  docs/finding-types/large-function.md."`
- A `crimes.config.json` showing a starter shape — `$schema` only.

The fixture's pinned JSON output (`docs/fixtures/messy-ts-app.json`)
regenerates with `generateInvoice` filtered out by default and
`suppressed_count: 1` in the summary; rerun with `--show-suppressed`
shows the same finding annotated. Both go in the docs.

---

## 11. Docs and website plan

### README

- Add a "Configuration" section (currently exists, brief) — expand to
  cover `$schema`, `detectors.disable`, `ia.aliasGroups`, per-shape
  thresholds. Link to `docs/configuration.md`.
- Add a "Suppressions" section under "CI" — three-paragraph summary
  with the `crimes ignore` example. Link to `docs/suppressions.md`.
- Add `crimes explain <id>` to the command table.

### `docs/configuration.md` (new file)

- Full `CrimesConfig` reference: every key, expected type, default,
  example.
- Per-shape `large_function` threshold cookbook (route-heavy, test-
  heavy, react-heavy).
- Alias group examples for common product vocabularies.
- The `architecture.layers` placeholder, marked _reserved_.
- Links to `docs/finding-types/index.md` for detector ids.

### `docs/suppressions.md` (new file)

- The on-disk shape with annotated example.
- `crimes ignore` workflow.
- "Suppressions vs baselines" — the distinction.
- Review guidelines: what makes a good `reason`, when to revisit, how
  to remove (hand-edit the JSON).
- The `--show-suppressed` flag.

### `docs/explain.md` (new file)

- The two input modes (`--from` vs default).
- Output walkthrough — what each section means.
- Agent recipe: pipe `scan` JSON to a file, then `explain --from`.
- "When to use `explain` vs `context`" — `explain` is per-finding,
  `context` is per-file.

### `docs/ci.md`

- Add the "Suppressions and this mode" subsection to each of Mode A /
  B / C.
- Add a top-level "Suppressions vs baselines" sub-section near the
  start (item from §9 above).
- Document `crimes diff --fail-on new-high` as a fourth gating mode
  (or a sub-mode of the existing diff command).

### `docs/json-schema.md`

- Add `report_type: "explain"` to the discriminator table.
- Add `report_type: "suppressions"` to the discriminator table.
- Document `Finding.suppressed` / `suppression_reason`.
- Document `*Report.suppressed_count`.
- Document `DiffReport.fail_on` / `failed`.
- New `ExplainReport` and `Suppressions` reference sections.

### `docs/agent-usage.md`

- Update the surface-status table — remove the "v0.5.0 candidate"
  flags from `crimes init` / `crimes ignore` / `crimes explain` /
  `crimes diff --fail-on new-high`; mark all four as shipped.
- New section "Using suppressions in an agent loop" — when to suggest
  `crimes ignore` vs `fix`, how to phrase the `--reason`.

### `AGENTS.md`

- Bump the "Not yet implemented" list — remove the four items that
  now ship in 0.5.0.
- Add a one-paragraph "Suppressions" note pointing at `docs/suppressions.md`.

### Claude skill (`.claude/skills/crimes/SKILL.md`)

- Add the four new commands to the surface list with one-line
  descriptions.
- Add a "When to suggest `crimes ignore`" sub-section emphasising
  evidence, not laziness.

### Website (`apps/website/src/`)

- Hero pill: `v0.5.0 · suppressions, config, and explainability`.
- New roadmap item for v0.5.0 shipped.
- Updated FAQ entry: "How do I customise `crimes` for my repo?" →
  point at `docs/configuration.md`.
- New FAQ entry: "Can I suppress findings I've decided are
  acceptable?" → point at `docs/suppressions.md`.
- `apps/website/src/llms.txt` — replace the v0.5.0 "next-target
  candidate" block with a "Shipped in v0.5.0" block, mirroring the
  v0.4.0 entry. Update the "Not shipped yet" list to drop the four
  items that now ship.

Website + `llms.txt` updates land in the final release-prep prompt
(Prompt E below), not before.

---

## 12. Risks and mitigations

### Suppressions hiding real problems

The single largest risk. Once `crimes ignore` is easy, the path of
least resistance is "suppress and move on" instead of "explain and
fix". Mitigations:

- **`reason` is required and non-empty.** Forcing a sentence is the
  cheapest filter against reflex suppression.
- **The file is reviewable in PRs.** Reviewers see every new entry
  and can push back ("this reason isn't specific enough").
- **`crimes explain` runs first in the recommended workflow.** The
  suggested command line is built by `explain`, not invented by the
  user — so the user has just read the rationale before suppressing.
- **`suppressed_count` is in every report.** A team can grep
  `git log -p .crimes/suppressions.json` or `crimes scan --format
  json | jq '.suppressed_count'` to monitor.
- **Defer expiry deliberately, but document the trade-off.** A future
  release can add `expires_at` to force periodic revisits.
- **Add an explicit anti-pattern note to `docs/suppressions.md`:**
  "If your reason is 'too noisy' or 'we know about this', the
  suppression is probably wrong. Either fix the code or tune the
  detector via config."

### Config complexity

Each knob is small, but the combined surface (detectors enable/disable
× per-shape thresholds × alias groups × suppression path) is bigger
than `crimes` has had before. Mitigations:

- **Zero-config still works.** Default behaviour is the same as
  0.4.0. The starter `crimes init` writes only `$schema` — every
  other field is optional.
- **`zod` validation surfaces errors precisely.** A typo on
  `largeFucntion` (sic) is a clear error, not a silent miss.
- **`docs/configuration.md` is the single source of truth.** Worked
  examples for the four common shapes.
- **One config file, one location.** `crimes.config.json` at the
  repo root. No `.crimes/config.json`, no nested overrides, no
  per-directory configs.

### Fingerprint drift

Suppressions and baselines both key on `<type>::<file>::<symbol>`.
File renames silently break both. Mitigations:

- **Document the trade-off prominently** in `docs/suppressions.md`
  and `docs/baselines.md` (if it exists; else inline in
  `docs/ci.md`). The current baseline docs already cover this.
- **Renames are a feature, not a bug.** A renamed file deserves a
  fresh review of whether the suppression still applies. The team
  re-suppresses with an updated reason, or they fix the underlying
  issue.
- **No automatic `--find-renames` logic.** Mirrors `git diff` without
  `--find-renames`; we don't want fuzzy suppression matching.

### Id vs fingerprint confusion

`crimes ignore` accepts both `crime_00005` (per-scan id) and
`large_function::src/billing.ts::foo` (stable fingerprint). The user
can easily forget which is which. Mitigations:

- **Inputs are unambiguous** — the fingerprint always contains `::`,
  the id always starts with `crime_`. No collision is possible.
- **Persist by fingerprint only.** The stored entry is always the
  fingerprint, never the id. Users who supplied an id see the
  fingerprint in the output (`Suppressed
  large_function::src/billing.ts::foo in ...`) so they learn the
  durable form.
- **Help text shows both.** `crimes ignore --help` documents the
  two forms with examples.

### Breaking JSON consumers

All additions are optional / additive — no field removed, no required
field changes type. The biggest concrete risk is a downstream
consumer that strictly validates against an exhaustive schema (no
extra properties) and fails on the new fields. Mitigations:

- **`docs/json-schema.md` documents** that the wire format permits
  additional optional fields under a non-breaking schema. Strict
  consumers are explicitly out-of-spec.
- **No required-field changes.** `Finding`, `ScanReport`,
  `ContextReport`, etc. all keep their existing required keys.
- **`schema_version` stays at `"0.1.0"`.** Consumers gating on
  version continue to work.

### Teams disabling detectors wholesale

`detectors.disable: ["concept_alias_drift"]` is one line in the config
and silently removes a useful signal everywhere. Mitigations:

- **Inline anti-pattern note in `docs/configuration.md`:** "Disabling
  a detector is a blunt tool. Prefer suppressing specific findings
  with `crimes ignore` and a reason. Reserve `disable` for detectors
  that fundamentally don't fit your repo (e.g. `todo_density` on a
  research codebase)."
- **The `disable` value is in the config and in `git log`.** A
  reviewer can spot a new entry.
- **Future release: a startup-time stderr warning** when an
  unrecognised disable is configured ("crimes: config disables 4
  detectors; consider per-finding suppressions for narrow
  exceptions"). Defer for now — the warning machinery doesn't exist
  yet.

### Suppressions becoming a dumping ground

Repeating the §1 framing as a concrete release risk: 12 months from
now, a repo's `.crimes/suppressions.json` could have 200 entries with
reasons like "todo" and "wip". Mitigations:

- **Above-mentioned `reason` requirement and review.**
- **The anti-pattern callout in the docs.**
- **A future `crimes audit-suppressions` command** that lists entries
  by age and reason length. Not in 0.5.0 scope — flag for 0.6.0.

---

## 13. Implementation prompt sequence

Five prompts plus a release-prep prompt. Each lands on `main`
independently with passing build / typecheck / test before the next
starts. Mirrors the structure of `AGENT_CONTEXT_QUALITY_PLAN.md` §9.

### Prompt A — Config loader extension + `crimes init`

Scope:

- Extend `CrimesConfig` in `packages/core/src/config.ts` with the
  optional fields from §5: `thresholds.largeFunction`, `ia.aliasGroups`,
  `detectors.{enable,disable}`, `suppressions.path`, `architecture.*`
  placeholder, `$schema`.
- Add `zod` validation (`CrimesConfigSchema`). Return
  `{ config, issues }` from `loadConfig`.
- Wire `thresholds.largeFunction.<shape>` into `policyFor()` in
  `packages/core/src/detectors/large-function.ts`.
- Wire `ia.aliasGroups` into `concept_alias_drift` detector
  initialisation.
- Wire `detectors.enable/disable` into `scan()` and `context()`
  detector assembly.
- Add `packages/cli/src/commands/init.ts` registering `crimes init`.
- Tests for each of the above per §10.

Done when: a fixture `crimes.config.json` with one of each new key
loads cleanly, the corresponding detector behaviour changes, and
`crimes init` writes a valid starter file.

### Prompt B — Suppressions file + scan application

Scope:

- Add `packages/core/src/suppressions.ts` with `Suppressions`,
  `SuppressionEntry`, `loadSuppressions`, `appendSuppression`,
  `applySuppressions` (pure helper).
- Define `SuppressionsSchema` in `zod`.
- Wire `applySuppressions` into `scan()`, `context()`,
  `checkBaseline()`, `diff()`, `verdict()` — after the report is built,
  before `--fail-on` evaluation.
- Add `--show-suppressed` flag to every CLI command listed.
- Add `Finding.suppressed?: true` + `suppression_reason?: string` and
  `*Report.suppressed_count?: number` to the schema types.
- Tests per §10.

Done when: a `.crimes/suppressions.json` with one entry causes the
matching finding to disappear from every report, `suppressed_count`
is 1, `--show-suppressed` re-surfaces it annotated, and `--fail-on`
ignores it.

### Prompt C — `crimes ignore`

Scope:

- Add `packages/cli/src/commands/ignore.ts` registering `crimes ignore
  <fingerprint-or-id> --reason "..."`.
- Required `--reason`, exits 2 if missing or empty.
- Id resolution path: when input matches `/^crime_\d+$/`, run a fresh
  scan to derive the fingerprint.
- Append/update via `appendSuppression`.
- Resolve `created_by` from `git config user.email` when available.
- Tests per §10.

Done when: `crimes ignore large_function::src/billing.ts::generateInvoice
--reason "tracked in #1234"` creates `.crimes/suppressions.json` with
one entry and a subsequent `crimes scan` filters it out.

### Prompt D — `crimes explain`

Scope:

- Add `whyItMatters` field to the `Detector` interface in
  `packages/core/src/detector.ts`.
- Populate `whyItMatters` on every shipped detector (one paragraph
  each).
- Add `packages/core/src/explain.ts` with `explain()` function
  returning `ExplainReport`.
- Add `packages/cli/src/commands/explain.ts` registering `crimes
  explain <id-or-fingerprint> [--from <scan.json>] [--format <fmt>]`.
- Add `formatExplainReport` / `formatExplainJsonReport` to
  `@crimes/reporter`.
- Tests per §10.

Done when: `crimes explain crime_00001` on the fixture returns a
populated `ExplainReport` and the human output contains the
suggested `crimes ignore` command.

### Prompt E — `crimes diff --fail-on` + docs + schema + fixtures + website

Scope:

- Add `applyDiffFailOn(report, threshold)` to `packages/core/src/diff.ts`.
- Wire `--fail-on new-high | new-medium` into
  `packages/cli/src/commands/diff.ts`.
- Update every doc under §11.
- Regenerate `docs/fixtures/messy-ts-app.json`.
- Update `apps/website/src/index.html` (hero pill, roadmap, FAQ) and
  `apps/website/src/llms.txt`.
- Update `ROADMAP_STATUS.md` to mark 0.5.0 shipped and propose the
  next-target theme.
- Bump `packages/cli/package.json` to `0.5.0`.
- Draft `docs/releases/v0.5.0.md`.

Done when: pnpm build / typecheck / test / smoke all pass, the
website builds cleanly, and a draft release-notes file is committed.

### Sequencing rationale

- **A before B** — config loader has to ship before suppressions so
  `suppressions.path` is honoured. Also unblocks per-shape thresholds
  in isolation.
- **B before C** — `crimes ignore` writes through the suppressions
  helpers added in B.
- **C before D** — `crimes explain` emits a suggested `crimes ignore`
  command; the command shape needs to be settled first.
- **D before E** — `crimes diff --fail-on` is small enough to ride
  alongside docs/schema in E. If E is too large, split into E1
  (`diff --fail-on` + schema) and E2 (docs + website + release prep).

This is the same shape `AGENT_CONTEXT_QUALITY_PLAN.md` used — small
PR-sized prompts, each with clear "done when" criteria.

---

## 14. Success criteria

`crimes@0.5.0` ships when all of the following are true:

1. **Config plumbing real.** A `crimes.config.json` with each new key
   (per-shape thresholds, alias groups, detector disable, suppressions
   path) loads cleanly and changes runtime behaviour as documented.
2. **`crimes init` works.** Running it in a fresh directory produces
   a config file that `loadConfig` validates and that `crimes scan`
   honours.
3. **Suppressions file format is real.** A hand-written
   `.crimes/suppressions.json` round-trips through `loadSuppressions`
   / `appendSuppression`.
4. **`crimes ignore` works.** Both `crime_NNNNN` and fingerprint inputs
   resolve correctly. `--reason` is required. Re-suppressing updates,
   doesn't duplicate.
5. **Suppressions apply consistently.** Every command that lists
   findings filters suppressed entries by default, surfaces
   `suppressed_count`, supports `--show-suppressed`, and never trips
   a `--fail-on` gate on a suppressed finding.
6. **`crimes explain` works.** Both `--from` and default modes resolve
   ids and fingerprints. The human output contains the suggested
   `crimes ignore` command verbatim; the JSON matches the
   `ExplainReport` schema.
7. **`crimes diff --fail-on new-high` works.** Exits `1` on a new high
   in the diff; exits `0` when the only new high is suppressed.
8. **No regressions.** Every 0.4.0 command and report stays
   bit-identical when no suppressions / no config changes are
   present. The fixture's `docs/fixtures/messy-ts-app.json`
   regenerates with the same five IA finding types still firing
   (apart from the one we deliberately suppress in the new fixture
   suppressions file).
9. **Build / typecheck / test / smoke all pass.** `pnpm build && pnpm
   typecheck && pnpm test && pnpm --filter crimes smoke` is green.
10. **Schema additions documented.** `docs/json-schema.md` carries
    every new optional field with a short rationale. `report_type:
    "explain"` and `report_type: "suppressions"` are in the
    discriminator table.
11. **No `schema_version` bump.** All changes are additive.
12. **No new detectors ship.** Same constraint as 0.4.0. The detector
    table stays at its current size.
13. **Docs honesty pass.** The "deferred (v0.5.0 candidate)" rows in
    `docs/agent-usage.md` flip to shipped. `AGENTS.md` and the
    Claude skill list the four new commands.

If any of 1, 4, 5, 6 fail, the release is not ready. 2, 3, 7 are
must-ship but smaller surface; 8–13 are gates on the release process.

---

## Appendix A — Comparison with `AGENT_CONTEXT_QUALITY_PLAN.md`

The two plans differ in shape:

- 0.4.0 was a **noise-reduction** release. No new commands; every
  must-ship item tuned an existing detector or report field. The
  scope was wide (six detectors touched) but shallow.
- 0.5.0 is a **product-surface** release. Four new commands (`init`,
  `ignore`, `explain`, `diff --fail-on`), one new on-disk artefact
  (`.crimes/suppressions.json`), and one substantial config extension.
  Narrower in detector impact, but deeper in CLI surface.

The implementation prompt sequence is correspondingly more vertical
(each prompt is feature-complete for its surface) than 0.4.0's was
(each prompt tuned a different detector).

The wedge — deterministic, local, JSON-first — is unchanged.

## Appendix B — One thing this plan deliberately doesn't do

It does not ship per-finding `scores.churn` / `scores.test_gap` /
`scores.blast_radius`. M2 work has now slipped past three minor
releases. The right answer is to give it a release of its own with
its own plan — not to wedge it into a release whose theme is
suppressions and config.

When that release lands (probably 0.6.0 or 0.7.0), it will revisit
the `large_function` thresholds with churn + test-gap data, which is
the right long-term answer to "is this big function actually a
problem?" — exactly the question 0.4.0's shape-aware thresholds
hand-rolled an approximation of.
