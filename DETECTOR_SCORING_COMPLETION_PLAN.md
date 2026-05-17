# `crimes@0.6.0` — Detector and Scoring Completion

Implementation plan for the next release. Nothing here ships until a
follow-up branch implements it. The authoritative spec stays `PRD.md`;
the live milestone tracker stays `ROADMAP_STATUS.md`; this file is the
0.6.0 plan handed to the implementation agents.

- **Repo state at planning time:** `crimes@0.5.0` (suppressions, config,
  and explainability) shipped to npm and `main`. CLI surface: `scan`,
  `scan --changed [--base] [--fail-on]`, `context`, `hotspots`,
  `diff [--fail-on]`, `baseline save/check`, `verdict`, `init`,
  `ignore`, `unignore`, `audit-suppressions`, `explain`. 17 detectors
  shipped across four categories (structural, petty, IA, plus the
  `large_function` shape-awareness from 0.4.0). Schema:
  `schema_version: "0.1.0"`.
- **Constraint:** do not change shipped CLI behaviour incompatibly,
  do not bump the package version, do not edit the website yet. This
  plan describes the work; a follow-up implementation pass writes the
  code.

The 0.5.0 plan deferred per-finding `scores.churn` / `test_gap` /
`blast_radius` (M2 work) and several detector tracks (dependency-graph,
remaining IA, frontend/UI, duplication, architecture-layer
enforcement). 0.6.0 ships all of them, plus the full `/docs` site
(M5 completion). 0.7.0 — the structured Claude + Codex testing +
evidence-hook milestone — runs against this complete slate and feeds
back into 0.8.0.

---

## 1. Product framing

**Recommended `0.6.0` theme: _detector and scoring completion._**

After three product-surface releases in a row (`0.3.0` IA crimes,
`0.4.0` agent context quality, `0.5.0` suppressions / config /
explainability), the product surface is stable. What's left from the
PRD's named milestones is **detector breadth (§8) and the risk
model (§10, M2)**. Plus M5 — the full docs site — which is non-detector
polish but still on the milestone list.

### Why ship the slate together rather than one track per release

The 0.5.0 plan recommended shipping per-finding scores in their own
release. That recommendation rested on a specific assumption: that the
right next release would be driven by what existing detector quality
exposed. But evidence loops surface **false positives in what's
already shipped, not gaps in what isn't**. Picking the next
detector track from "what 0.5.0 testing surfaced" would only narrow
the choice of which gap to close — not whether to close gaps at all.

The kitchen-sink shape is defensible because:

1. **The PRD-named detectors are already triaged.** They survived
   the IA plan, the agent-context plan, and the suppressions plan as
   "still on the long-term roadmap." Each has design notes already
   in `ROADMAP_STATUS.md`'s "candidate" sections.
2. **The infrastructure is shared.** `scores.blast_radius` needs an
   import graph; dependency-graph detectors need an import graph;
   architecture-layer enforcement needs an import graph. Building
   them in separate releases would re-implement import parsing three
   times. Same for JSX inspection (frontend detectors share it) and
   AST hashing (duplication + Duplicate Component Shape share it).
3. **0.7.0 testing is more valuable against a complete slate.**
   Structured Claude + Codex testing of one slice tells you whether
   that slice works. Testing of the whole slate tells you which slices
   work and which don't, and lets the evidence-hook see the full
   product as users see it. The 0.7.0 milestone _depends_ on 0.6.0
   being broad enough to be representative.

### What this trades

**More scope per release.** This plan is materially larger than 0.5.0.
Roughly: 16 new detectors, three pieces of new core infrastructure,
M5 docs site, plus one polish item.

**Higher false-positive risk at ship time.** 0.4.0's lesson was that
noise erodes trust faster than missing detectors do. Shipping ~16
detectors at once means each gets less per-detector tuning than 0.3.0's
slate got. The mitigation is 0.7.0, which is explicitly the
noise-audit + evidence loop milestone — but the contract is that
0.6.0 ships with conservative confidence scores and explicit
"appears to" / "may" phrasing on the new detectors. They surface
signal; they don't claim semantic truth.

### Why the deferral pattern stops here

`scores.churn` / `test_gap` / `blast_radius` have slipped past three
minor releases (0.2.0 → 0.3.0 → 0.4.0 → 0.5.0). Each plan named M2
work as "deferred." At some point the deferral itself is the cost.

The 0.4.0 release shipped `HotspotsReport.history_limited` and
shape-aware `large_function` — both of which would be cleaner with
real `scores.churn` / `test_gap` underneath them rather than
hand-rolled heuristics. The 0.5.0 release shipped `crimes explain`
which displays `confidence` and severity but has no `churn` /
`test_gap` / `blast_radius` to round out the explanation. Every new
detector that ships without real scores carries the same gap.

Shipping the scores in 0.6.0 _both_ completes M2 _and_ retroactively
improves every detector that's already in the field.

---

## 2. `0.6.0` release goal

> **`crimes@0.6.0` finishes the PRD's detector and scoring vision:
> every finding carries real `churn` / `test_gap` / `blast_radius`,
> every named PRD §8 detector track ships at least its initial
> conservative slice, and `crimes.sh` carries the full docs site
> M5 promised.**

By the end of `0.6.0`, all of these must be true:

1. **Per-finding scores are populated on every finding** —
   `scores.churn`, `scores.test_gap`, `scores.blast_radius` move
   from "reserved" to "computed." `scores.agent_risk` is recomputed
   from them rather than assigned per-detector.
2. **Architecture-layer enforcement consumes the 0.5.0 placeholder.**
   `architecture.layers` + `architecture.rules` in
   `crimes.config.json` drive a new `layer_violation` detector.
3. **Dependency-graph detectors ship.** `circular_dependency`,
   `deep_import`, `high_fan_in_fan_out`. Built on a shared import
   graph that also feeds scores and architecture enforcement.
4. **The deferred IA detectors ship.** `orphaned_destination`,
   `parallel_destination`, `permission_ia_drift`,
   `action_label_drift`, command-drift variant of
   `docs_code_drift`.
5. **The frontend / UI agent-risk track ships its first slice.**
   `design_token_escape`, `accessible_interaction_risk`,
   `duplicate_component_shape`, `responsive_fragility`,
   `copy_ia_drift`, `visual_regression_review_hint`.
6. **The duplication track ships, deduplicated against petty crimes.**
   `exact_duplicate_block`, `near_duplicate_block`,
   `duplicated_role_status_plan_check`. The shape of these is
   reconciled against existing `magic_domain_literal_scatter` and
   `concept_alias_drift` so neither double-fires.
7. **M5 docs site is live.** Astro+Starlight, deployed alongside the
   existing landing page on `crimes.sh/docs`.
8. **Polish: stderr breadcrumb when `detectors.disable` is wholesale.**
   The only remaining polish item from the 0.5.0 plan's deferred list.
9. **No breaking schema changes.** All additions are optional /
   additive — `schema_version` stays at `"0.1.0"`.
10. **No LLM, no cloud, no API key.** Same wedge.

Out of scope for `0.6.0` (still deferred or rejected):

- **M6 — Homebrew tap / standalone binaries.** Deferred indefinitely;
  re-evaluate when a user asks.
- **Suppression `expires_at` / `owner`.** Rejected — added complexity
  without enough benefit. Folks turn suppressions on or off.
- **Custom suppression matchers (glob/regex).** Deferred until
  requested.
- **Detector-level severity overrides in config.** Deferred until
  needed.
- **Interactive `crimes init`.** Still deferred.
- **LLM-assisted modes / `crimes ask`.** Still v1+.
- **Structured testing + evidence hook into workflow** —
  that's 0.7.0, not 0.6.0.

---

## 3. Recommended scope

### Must ship

The minimum bar for the release. Drop any of these and the theme is
half-built.

1. **Shared infrastructure: import graph** (§4.1). Foundation for
   `scores.blast_radius`, layer enforcement, and three dependency
   detectors.
2. **Shared infrastructure: JSX inspection layer** (§4.2).
   Foundation for the frontend detector track.
3. **Shared infrastructure: AST hashing** (§4.3). Foundation for the
   duplication detector track + Duplicate Component Shape.
4. **Shared infrastructure: scoring data sources** (§4.4).
   `computeChurn`, `computeTestGap`, `computeBlastRadius` exposed
   through `DetectorContext` so every detector populates real scores.
5. **Per-finding scores on every finding** (§5).
6. **Architecture-layer enforcement** (§6).
7. **Dependency-graph detectors** (§7): `circular_dependency`,
   `deep_import`, `high_fan_in_fan_out`.
8. **Remaining IA detectors** (§8): `orphaned_destination`,
   `parallel_destination`, `permission_ia_drift`,
   `action_label_drift`, `command_drift_docs_code_drift`.
9. **Frontend / UI detectors** (§9): six detectors.
10. **Duplication detectors** (§10): three detectors, with explicit
    overlap audit vs petty crimes.
11. **M5 docs site** (§11).
12. **Polish: stderr breadcrumb for wholesale `detectors.disable`**
    (§12).

### Should ship

Worth doing in 0.6.0 if scope allows. Higher leverage than yet-another-
detector but smaller surface than a must-ship.

13. **`cli_command_registrar` shape for `large_function`.** Dogfood
    observation: the crimes monorepo's own `register*Command`
    Commander chains are the dominant God Function false positive on
    the first-party self-scan. Adding the shape mirrors the 0.4.0
    approach for `react_component` / `page_export` / `test_callback`.
    A 200-line threshold at low severity would clean up most of the
    self-scan noise.
14. **`crimes hotspots <subdir>` should find churn via the enclosing
    git repo.** Today, passing a non-repo-root subdirectory reports
    "not a git repo" and degrades to severity-only ranking. The fix:
    walk upward from `<subdir>` to find the enclosing git root for
    churn purposes; keep findings scoped to `<subdir>`. Small.

### Could ship

If time allows. None of these block the release.

15. **Self-referencing detector exemption.** Dogfood observation:
    `todo_density` fires on its own detector source because the source
    contains the literal regex pattern `"TODO|FIXME|XXX|HACK"`. A
    narrow allowlist for "this file *is* the detector that looks for
    these strings" handles the case. Could also be a config-level
    exclusion the team writes themselves.
16. **Test-file God File shape.** Dogfood observation: `reporter.test.ts`
    at 910 lines, `context.test.ts` at 524 lines. Tests legitimately
    grow large with many small `it` blocks. Shape: `test_file` at
    1500-line threshold + low severity. Small follow-up to 0.4.0's
    `large_function` shape work, but applied at the file level.

### Defer (out of scope for 0.6.0)

- **All "Out of scope" items from §2** (Homebrew, suppression
  expires_at, custom matchers, severity overrides, interactive init,
  LLM modes).
- **Structured testing + evidence hook** — that's 0.7.0.
- **Petty crimes follow-ups (more domain-specific detectors).** Their
  own track if it returns at all.
- **Python language pack.** Open question in PRD §26. Re-evaluate
  after 0.7.0.

**Conservative shape:** must-ship items 1–12 land. Should-ship items
13–14 land if any prompt has spare scope. Could-ship items defer to
0.7.0 evidence-driven tuning.

---

## 4. Shared infrastructure

The kitchen sink only works if the foundations are built once and
shared. Four pieces, all in `packages/core/src/`.

### 4.1 Import graph (`packages/core/src/imports/`)

**Purpose.** A repo-wide map of `file → [imports]` and the inverse
`file → [imported by]`. Used by:

- `scores.blast_radius` (count of files transitively reachable from
  this file via imports)
- `circular_dependency` detector (cycle finder on the graph)
- `deep_import` detector (path depth analysis on import specifiers)
- `high_fan_in_fan_out` detector (in-degree / out-degree analysis)
- `layer_violation` detector (cross-layer edge detection)

**Shape.**

```ts
export interface ImportEdge {
  /** Repo-relative POSIX path of the source file. */
  from: string;
  /** Repo-relative POSIX path of the import target (resolved). */
  to: string;
  /** Raw import specifier as written in source ("./foo" / "@/lib/bar"). */
  specifier: string;
  /** True when the specifier is a bare module ("react", "node:fs"). */
  external: boolean;
}

export interface ImportGraph {
  edges: ImportEdge[];
  /** Repo-relative path → out-edges. */
  out: Map<string, ImportEdge[]>;
  /** Repo-relative path → in-edges (inverse). */
  in: Map<string, ImportEdge[]>;
  /** All files the graph knows about (sources of out-edges + targets of in-edges). */
  files: Set<string>;
}

export function buildImportGraph(args: {
  root: string;
  files: string[];
}): Promise<ImportGraph>;
```

**Resolution rules.** Best-effort:

- Relative specifiers resolve to the file system, trying
  `.ts/.tsx/.js/.jsx/.mjs/.cjs/.d.ts` extensions and `/index.*`.
- `@/` and `~/` aliases resolve via `tsconfig.json` `paths` when the
  config exists. Otherwise treated as external.
- Bare specifiers (`react`, `node:fs`) are marked `external: true`
  and skipped from the in/out maps. They still appear in `edges` so
  external-dependency analysis can read them.
- Dynamic `import()` calls with string-literal specifiers are
  included. Non-literal dynamic imports are skipped silently.

**Caching.** The graph is built once per scan, attached to
`DetectorContext.imports` alongside the existing `ia` and `petty`
indexes. Detectors must not re-walk imports themselves.

**Performance budget.** 200ms on a 1k-file repo. The walk is mostly
file I/O — parallelise reads. For repos that exceed the budget, set
`imports_limited: true` and emit a `history_limited`-style note on
the report.

**Tests.** Add `packages/core/src/imports/build.test.ts` with at
least:

- Empty repo → empty graph.
- Three-file chain `a → b → c` → correct out/in maps.
- Cycle `a → b → a` → both edges present, no infinite loop.
- Relative path with omitted extension resolves correctly.
- tsconfig `paths` alias resolves correctly.
- Bare module specifier is marked `external: true`.
- Dynamic `import()` with literal specifier is captured.
- Dynamic `import()` with non-literal expression is skipped without
  error.

### 4.2 JSX inspection layer (`packages/core/src/jsx/`)

**Purpose.** A small helper module that walks JSX trees and exposes
queries the frontend detectors need. `language-js` already parses JSX
into the AST; this module is the query layer on top.

**API.**

```ts
export interface JsxElementInfo {
  /** Element name as written ("Button", "div", "Pricing.Tier"). */
  name: string;
  /** Inclusive [start, end] line range. */
  lines: [number, number];
  /** Attributes by name, with literal values when statically known. */
  attributes: Map<string, JsxAttributeValue>;
  /** Children, in document order. */
  children: JsxNode[];
  /** True for `<Component />` (self-closing, no children). */
  selfClosing: boolean;
}

export type JsxAttributeValue =
  | { kind: "string"; value: string }
  | { kind: "expression"; source: string } // raw source text for `{...}`
  | { kind: "boolean"; value: true }       // `<Foo disabled />`
  | { kind: "spread"; source: string };    // `<Foo {...props} />`

export type JsxNode = { kind: "element"; element: JsxElementInfo }
                   | { kind: "text"; value: string };

export function walkJsx(args: {
  source: string;
  ast: ParsedFile;
}): JsxElementInfo[];

/** Convenience: find all JSX elements with `name` matching the predicate. */
export function findJsxElements(
  elements: JsxElementInfo[],
  predicate: (el: JsxElementInfo) => boolean,
): JsxElementInfo[];
```

**What the frontend detectors will ask the layer:**

- `design_token_escape`: "find elements with `style` or `className`
  attributes containing hex / rgb / px / numeric-radius literals."
- `accessible_interaction_risk`: "find non-button elements with
  `onClick` and no `role` / `aria-label` / `tabIndex`."
- `duplicate_component_shape`: "produce a structural hash of each
  JSX subtree."
- `responsive_fragility`: "find elements with fixed-width style
  values (`width: 800px`, `fontSize: 24px`)."
- `copy_ia_drift`: "find string literals inside JSX text nodes and
  string-valued attributes."
- `visual_regression_review_hint`: "count JSX elements in the file +
  combine with churn from §4.4."

**Performance budget.** O(N) over JSX nodes; the existing AST walk
already touches them. No extra parse pass.

**Tests.** `packages/core/src/jsx/walk.test.ts` with simple
fixtures covering self-closing, fragments, nested elements,
expression attributes, spread attributes, text children.

### 4.3 AST hashing (`packages/core/src/ast-hash/`)

**Purpose.** Structural fingerprints of function bodies and JSX
subtrees so the duplication detectors and `duplicate_component_shape`
can identify near-duplicates without re-parsing the same source.

**Approach.** Token-based, not full AST traversal. For each
candidate (function body or JSX subtree), produce:

- An **exact hash** — SHA-1 of the normalised token stream (whitespace
  collapsed, comments stripped, identifier names preserved). Two
  identical functions produce the same exact hash.
- A **shape hash** — SHA-1 of a stripped token stream where local
  identifier names are replaced by positional tokens (`$0`, `$1`,
  …). Two functions with the same structure but different variable
  names produce the same shape hash. This is what `near_duplicate`
  uses.

**API.**

```ts
export interface AstHash {
  /** Exact-tokens SHA-1, hex. Identical when source text is identical modulo whitespace/comments. */
  exact: string;
  /** Structural-tokens SHA-1, hex. Identical for the same shape with renamed locals. */
  shape: string;
  /** Token count — used to filter "trivially short" candidates. */
  tokens: number;
}

export function hashFunction(fn: ParsedFunction, source: string): AstHash;
export function hashJsxSubtree(el: JsxElementInfo, source: string): AstHash;
```

**Performance budget.** Hashing is fast (KB-level token streams).
Token extraction can reuse the existing parser output. Budget: the
duplication detectors' aggregate cost should stay under 500ms on a
1k-file repo.

**Tests.** `packages/core/src/ast-hash/hash.test.ts`:

- Identical functions produce identical exact + shape hashes.
- Same shape, different identifier names → same shape hash,
  different exact hash.
- Different shape (different control flow) → different shape hash.
- Whitespace and comment differences ignored.
- Token count threshold filters trivial helpers (≤ N tokens).

### 4.4 Scoring data sources (`packages/core/src/scoring/`)

**Purpose.** Three pure helpers that compute per-finding scores.
Wired into `DetectorContext` so every detector populates real values
instead of leaving the fields undefined.

**API.**

```ts
export interface ScoringContext {
  churn: ChurnIndex;          // see below
  testGap: TestGapIndex;      // see below
  blastRadius: BlastRadiusIndex; // see below
}

export interface ChurnIndex {
  /** Returns [0,1] churn for a file, from git log over the configured window. */
  forFile(repoPath: string): number;
  /** True when the underlying git repo is shallow / non-existent. */
  limited: boolean;
}

export interface TestGapIndex {
  /** Returns [0,1] test gap for a file. 1.0 = no nearby tests; 0.0 = strong test coverage. */
  forFile(repoPath: string): number;
}

export interface BlastRadiusIndex {
  /** Returns [0,1] blast radius — normalised count of transitive importers. */
  forFile(repoPath: string): number;
}

export function buildScoringContext(args: {
  root: string;
  files: string[];
  imports: ImportGraph;
  since?: string; // git-log window; defaults to 90d
}): Promise<ScoringContext>;
```

**Formulae (v0.6.0):**

- `churn[file] = min(commits_touching_file_in_window / 20, 1)` —
  same saturation curve `crimes hotspots` already uses.
- `test_gap[file] = ` an inverted 0–1 score:
  - 0.0 when ≥1 sibling test file with the same basename exists
    (`foo.test.ts` next to `foo.ts`), OR a test file under
    `__tests__/` covers the basename, OR a test file imports the
    target file.
  - 0.5 when one of those signals exists but no test imports the
    target.
  - 1.0 when none of those signals exist.
  - Test files themselves get `test_gap: 0` (they're not the thing
    being tested).
- `blast_radius[file] = min(transitive_importers_count / 50, 1)`.

**Per-finding score assembly.** Detectors no longer set
`scores.agent_risk` directly. Instead, `core` computes a fallback
weighting after the detector runs:

```ts
agent_risk = clamp01(
  0.4 * severity_numeric
  + 0.2 * confidence
  + 0.15 * churn
  + 0.15 * test_gap
  + 0.10 * blast_radius
);
```

Detectors that want to override (e.g., test-callback `large_function`
findings scale `agent_risk` down) declare a `agentRiskScale` modifier
the same way the 0.4.0 `largeFunction` shape policy does today.

**Performance budget.** Churn collection is dominated by `git log`
(amortised: O(commits-in-window)). Build once per scan. Test gap is
O(F * test_signal_check). Blast radius is O(F) over the import
graph's transitive closure — memoise per-file.

**Tests.** `packages/core/src/scoring/build.test.ts`:

- `forFile` on a never-touched file returns 0.
- `forFile` on a heavily-churned file returns near 1.
- Shallow clone → `limited: true` and degraded values.
- `test_gap` for a file with sibling `.test.ts` returns 0.
- `test_gap` for a file imported by a test file returns 0.
- `test_gap` for a totally untested file returns 1.
- `blast_radius` correctly counts transitive importers.

---

## 5. Per-finding scores design (M2 completion)

### What changes on every finding

Today (`0.5.0`):

```jsonc
{
  "scores": {
    "severity": 0.9,
    "confidence": 0.95,
    "agent_risk": 0.92
  }
}
```

After `0.6.0`:

```jsonc
{
  "scores": {
    "severity": 0.9,
    "confidence": 0.95,
    "churn": 0.65,
    "test_gap": 0.20,
    "blast_radius": 0.55,
    "agent_risk": 0.81
  }
}
```

`churn` / `test_gap` / `blast_radius` are documented as **ordinal**
signals — treat the exact numbers as advisory; they may shift between
minor releases as the underlying formulae refine. The contract is
"higher is worse" plus the [0, 1] range.

### Effect on existing detectors

- `large_function` no longer needs hand-rolled shape weights for
  `agent_risk` — the unified formula handles it. The shape-aware
  threshold logic stays (we still don't want test callbacks firing at
  60 lines). Only the `agent_risk` computation moves to the shared
  formula.
- `large_file` similarly defers to the shared formula.
- IA detectors keep their per-detector `confidence` curves but
  benefit from churn/test_gap weighting.
- `todo_density`, `direct_date`, and the petty crimes inherit
  `blast_radius` / `test_gap` for free.

### Effect on existing reports

- `ScanReport`, `ContextReport`, `BaselineCheckReport`, `DiffReport`,
  `VerdictReport`, `Baseline.findings[]`, `ExplainReport.finding` —
  every report that carries `Finding` now carries the three new
  score fields. Optional / additive — `schema_version` stays at
  `"0.1.0"`.
- The baseline file (`.crimes/baseline.json`) **does not** persist
  the new scores. Same rationale as today: scores drift between
  scans; the baseline only persists the fingerprint identity.

### Reporter changes

The human reporter gains a one-line "Risk profile" block when at
least one of the three new scores is > 0.5:

```
1. src/billing/invoice.ts:37-240 (generateInvoice)
   Charge: God Function
   Risk profile: churn 0.65 · test gap 0.20 · blast radius 0.55
   Summary: …
```

The block is omitted on findings where all three are ≤ 0.5 to avoid
clutter. `--all` always shows it.

### `crimes explain` extension

The `ExplainReport` already contains the finding. The human reporter
adds a "Risk profile" section between "Evidence" and "Suggested
actions" when scores are present:

```
Risk profile
  · churn:        0.65 — touched in 13 of the last 90 days of commits
  · test gap:     0.20 — sibling test file present and importing this module
  · blast radius: 0.55 — 28 transitive importers
```

The wording is generated from the score plus the underlying count —
the score is presented alongside its raw evidence.

---

## 6. Architecture-layer enforcement (detector)

### What it detects

`layer_violation` — a `from` file imports a `to` file that the
configured `architecture.rules` block. Uses the 0.5.0
`architecture.layers` + `architecture.rules` config shape:

```jsonc
{
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

### Heuristic

1. For each file, assign it to a layer using the layer patterns
   (first match wins).
2. Walk every import edge in the import graph (§4.1).
3. For each edge `from → to`:
   - If both endpoints have layer assignments AND a `rules` entry
     forbids the cross, emit a `layer_violation` finding on the
     `from` file.
4. Use `Finding.related_files` to surface the violated edges in the
   human "Also touches:" block.

### Evidence shape

```
evidence:
  - "src/domain/billing.ts (layer: domain) imports src/components/Pricing.tsx (layer: ui)"
  - "rule: domain cannotImport ui"
```

### Severity / confidence

- **medium** by default. Layer rules are config; the team has opted
  in.
- **high** when ≥3 distinct edges cross the same rule (concentrated
  violation).
- `confidence: 0.95` — this is a deterministic graph check.

### False-positive risks

- Misconfigured `pattern` globs. If a layer's pattern is wrong,
  every assignment is wrong. Mitigation: when a file matches no
  layer pattern, it gets no layer assignment and contributes to no
  finding. The detector exits silently rather than mis-firing.
- Test files importing UI from domain code _to test the integration_.
  Mitigation: by default, files matching the configured `exclude` set
  (typically test patterns) are skipped from layer-violation
  emission, but their imports do still appear in the graph for
  blast-radius purposes.

### Tests

`packages/core/src/detectors/layer-violation.test.ts`:

- Two-layer fixture with a forbidden edge fires once.
- Multiple forbidden edges from the same file collapse to one
  finding with multiple evidence rows.
- File outside any layer pattern produces no finding.
- Test file excluded by config doesn't fire.

---

## 7. Dependency-graph detectors

### 7.1 `circular_dependency` — Circular Dependency

**Detects.** Strongly-connected components in the import graph with
size ≥ 2.

**Heuristic.**

1. Run Tarjan's algorithm on the import graph.
2. For each SCC with ≥ 2 nodes, emit one finding per cycle anchored
   on the lexicographically-first file in the cycle.
3. Evidence lists every file in the cycle, in dependency order.

**Severity.**

- **medium** for 2-file cycles (often legitimate — type imports).
- **high** for ≥ 3-file cycles.

**Confidence.** `0.95`.

**False-positive risks.**

- Type-only cycles (`import type` between files). Mitigation:
  language-js distinguishes type imports from value imports; the
  detector skips cycles composed entirely of type imports.
- Generated code (e.g., barrel files generated by tooling). Already
  excluded via the default config.

### 7.2 `deep_import` — Deep Import Abuse

**Detects.** Imports that reach deep into another package's private
structure (e.g., `from "@scope/lib/dist/internal/_private/x"`).

**Heuristic.**

1. For each import edge with `specifier` that includes ≥ 3 path
   segments past a package name or alias root, flag it.
2. Skip imports inside the same package (`./` / `../` relative paths
   that stay in the source tree).
3. Skip imports that resolve through an explicit `package.json`
   `exports` map (the package has opted in).

**Severity.** `low` for one offending import in a file, `medium` for
≥ 3, `high` for ≥ 10.

**Confidence.** `0.85` — the heuristic is sharp on path depth but
"deep import" is a soft norm.

**False-positive risks.**

- Monorepos with deep workspace paths. Skipped by checking against
  the workspace package roots.
- Type-only deep imports (`import type { ... } from
  "lib/dist/types"`). The fix is the same as 7.1 — skip type-only.

### 7.3 `high_fan_in_fan_out` — High Fan-In / Fan-Out Module

**Detects.** Files whose in-degree (number of importers) or
out-degree (number of imports) exceeds a high threshold relative to
the repo's distribution.

**Heuristic.**

1. Compute in-degree and out-degree per file from the import graph.
2. Compute the 95th-percentile cutoff for each direction.
3. Flag files at or above the cutoff.

**Severity.** `low` baseline, `medium` for files in the 99th
percentile of either direction.

**Confidence.** `0.70` — high fan-in is sometimes legitimate (utility
modules, shared types).

**False-positive risks.**

- Genuinely-shared utility modules. The detector's _purpose_ is to
  surface these as agent-risk signals ("this file ripples widely"),
  not to claim they're wrong. Phrasing in `summary` reflects that.

---

## 8. Remaining IA detectors

Five detectors deferred from `0.3.0`. Each follows the
`docs/finding-types/ia.md` shape: cross-file evidence, "appears to"
phrasing, conservative confidence.

### 8.1 `orphaned_destination` — Orphaned Destination

**Detects.** Page / route / screen files unreachable from primary
navigation, route registries, sitemap metadata, or internal links.

**Heuristic.**

1. The existing IA index (`IaRouteSignal`) already discovers route
   files.
2. The IA index's nav signals + label signals + doc-link signals
   provide the "reachable" set.
3. Any route file that no nav source, no internal doc link, and no
   route-registry entry references is flagged.

**Severity.** `low` (informational — could be intentional WIP).
**Confidence.** `0.65`.

**False-positive risks.**

- Newly-added routes mid-PR (the nav update lands later).
  Mitigation: low severity, low confidence, "appears unreachable"
  phrasing.
- Routes added via dynamic registration (e.g., file-system routing
  with custom config). The IA index discovers Next.js / Remix /
  Astro conventions; non-convention routing is out of scope.

### 8.2 `parallel_destination` — Parallel Destination

**Detects.** Multiple pages or flows that appear to serve the same
user intent (`/billing` vs `/settings/billing` vs
`/account/subscription`).

**Heuristic.** Reuses concept_alias_drift's path-token analysis on
route signals specifically. Two routes are "parallel candidates" when:

1. They share ≥ 2 path tokens from the IA alias groups.
2. Their default-export components have similar names (token
   overlap).
3. Neither is reachable through the other (no redirect / link
   between them in the IA doc-link graph).

**Severity.** `medium`. **Confidence.** `0.60`.

**False-positive risks.**

- Routes that legitimately split a concept (e.g., `/team/billing`
  for the team admin vs `/account/subscription` for the user's own).
  Mitigation: requires the concept-alias evidence to be in the
  product surface (≥ 2 distinct top-level dirs), and emits "appears
  to serve overlapping intent" phrasing.

### 8.3 `permission_ia_drift` — Permission IA Drift

**Detects.** Navigation, route guards, docs, and policy code describe
access using different role / permission concepts for the same
destination.

**Heuristic.**

1. The existing IA index discovers `IaPermissionSignal` from common
   patterns: `<RouteGuard role="admin">`, `requirePermission(...)`,
   `<NavItem visibleTo={...}>`, doc headings under "Permissions" or
   "Access".
2. For each destination, collect the union of permission signals
   from nav / route / doc sources.
3. Fire when the same destination has ≥ 3 sources and ≥ 2 distinct
   permission tokens.

**Severity.** `medium`. **Confidence.** `0.70`.

**Evidence.**

```
destination: /admin/users
nav guard:   visibleTo="admin"
route guard: requirePermission("owner")
docs:        "Team owners can …" (docs/teams.md:42)
```

**False-positive risks.**

- Hierarchical permission models where `owner` and `admin` are
  intentionally different. The detector says "appears to" and
  surfaces evidence; the team decides. Phrasing matches IA
  conventions.

### 8.4 `action_label_drift` — Action Label Drift

**Detects.** The same action or object labelled differently across
UI copy and code: "Delete" / "Remove" / "Archive"; "User" / "Member" /
"Seat".

**Heuristic.**

1. Extract action verbs and object nouns from JSX text nodes and
   string-valued button props (uses §4.2).
2. Match against an action-alias seed list (built-in, similar to
   `DEFAULT_ALIAS_GROUPS`): `{ delete, remove, archive, trash }`,
   `{ user, member, seat, account_user }`, `{ owner, admin,
   manager }`, etc.
3. Fire when ≥ 3 aliases from the same group appear across the UI,
   each in ≥ 2 files.

**Severity.** `low` to `medium` depending on alias count.
**Confidence.** `0.60`.

**False-positive risks.**

- Domain-distinct actions ("Delete" the file vs "Archive" the file
  meaning different things). Mitigation: phrased as "appears to
  label the same action with different verbs"; team decides.

### 8.5 `command_drift_docs_code_drift` — Docs Reference a Command the `bin` No Longer Implements

**Detects.** A docs file under `docs/**` or a root-level `*.md`
references a CLI command that the published `bin` no longer exposes.

**Heuristic.**

1. Read `package.json` `bin` entry (already done by
   `missing_agent_context`).
2. Walk the bin entry's source to find Commander
   `program.command("…")` registrations. Build the set of advertised
   subcommand names.
3. Walk docs, looking for fenced code blocks tagged `bash` /
   `shell` / `sh` and inline `crimes <command>` references.
4. Fire when a doc references a subcommand not in the advertised
   set.

**Severity.** `low`. **Confidence.** `0.80`.

**Evidence.** `docs/agent-usage.md:42 references "crimes ask" but
the bin advertises: scan, context, hotspots, …`

**Variant of `docs_code_drift`.** The 0.3.0 `docs_code_drift`
detector handles broken local links. This is the deferred
command-drift variant.

---

## 9. Frontend / UI agent-risk track

Six detectors. All use the JSX inspection layer (§4.2). Initial
priorities per `ROADMAP_STATUS.md` "Frontend / UI risk candidates":
Design Token Escape first, then Accessible Interaction Risk, then
Duplicate Component Shape.

### 9.1 `design_token_escape` — Design Token Escape

**Detects.** Hard-coded colors, spacing, shadows, radii, z-indexes,
or breakpoints in JSX `style` / `className` attributes when local
design tokens already exist.

**Heuristic.**

1. Walk JSX (§4.2). For each `style={{ ... }}` expression and each
   `className="..."` value, extract:
   - Hex colors (`#abc`, `#abcdef`)
   - rgb/rgba/hsl values
   - Pixel literals (`12px`, `0.5rem`)
   - Numeric z-index / opacity / shadow values
2. Compare against tokens discovered from common locations:
   `tailwind.config.{js,ts}` `theme.extend.colors`, `src/styles/**.ts`
   exporting an object literal, CSS-in-JS theme imports.
3. Fire on a file when ≥ 5 hard-coded values appear that have a token
   equivalent.

**Severity.** `low` for 5–9 violations, `medium` for ≥ 10.
**Confidence.** `0.75`.

### 9.2 `accessible_interaction_risk` — Accessible Interaction Risk

**Detects.** Clickable non-button elements without accessible labels.

**Heuristic.**

1. Find JSX elements with `onClick` (or `onPress` / `onTap`).
2. Flag when:
   - The element name is `div` / `span` / `a` (without `href`),
   - AND there is no `role` attribute,
   - AND there is no `aria-label` / `aria-labelledby` / `title`,
   - AND there is no `tabIndex`.
3. Skip elements that are already buttons / links with `href`.

**Severity.** `medium`. **Confidence.** `0.85`.

**Why not axe.** This detector does not try to replicate
accessibility-scanner coverage. It surfaces a small, specific shape
that AI agents repeatedly produce (a `<div onClick>` without keyboard
support). The wedge is agent-edit-risk, not accessibility audit.

### 9.3 `duplicate_component_shape` — Duplicate Component Shape

**Detects.** Repeated JSX subtree structures for buttons, cards,
forms, modals, etc.

**Heuristic.**

1. Walk JSX (§4.2). For each "interesting" subtree (≥ 4 nodes, named
   element root), compute the shape hash (§4.3).
2. Group subtrees by shape hash across the repo.
3. Fire when ≥ 3 distinct files contain the same shape.

**Severity.** `medium`. **Confidence.** `0.70`.

**Evidence.** Lists the files and line ranges of each duplicate.

**False-positive risks.**

- Trivial shapes (e.g., empty `<div />`). Filtered by the ≥ 4-node
  threshold.
- Intentional patterns (e.g., a `<Card>` wrapper used everywhere).
  Mitigation: shape hash only fires when the JSX is structurally
  similar enough that a shared component would have replaced it.
  Conservative confidence.

### 9.4 `responsive_fragility` — Responsive Fragility

**Detects.** Fixed widths, viewport-scaled typography, hard-coded
grid columns without mobile alternatives.

**Heuristic.**

1. Walk JSX style expressions. Flag:
   - `width: "Npx"` where N > 320.
   - `fontSize: "Npx"` where N > 16 and no `@media` adjacent.
   - `gridTemplateColumns: "Npx ..."` repeated.
2. Fire when ≥ 3 violations in one file.

**Severity.** `low`. **Confidence.** `0.65`.

### 9.5 `copy_ia_drift` — Copy / IA Drift (frontend variant)

**Detects.** Inconsistent labels in JSX for the same action or
concept.

**Heuristic.** Same as 8.4 `action_label_drift` but restricted to
JSX text nodes (not all string literals). This is the frontend-
focused variant; 8.4 catches drift across code, this catches it
within UI copy.

**Overlap audit.** 8.4 and 9.5 are the same detector with different
inputs. Implementation should be one detector with two evidence
modes; UI report distinguishes them in the human output.

### 9.6 `visual_regression_review_hint` — Visual Regression Review Hint

**Detects.** UI files where churn + responsive complexity + low test
proximity suggest visual review is warranted.

**Heuristic.**

1. For each UI file (component / page / layout):
   - High churn (§4.4 `churn` ≥ 0.7),
   - Either responsive_fragility findings OR ≥ 1 `@media` query OR ≥ 1
     conditional render based on viewport,
   - Low test gap (§4.4 `test_gap` ≥ 0.7),
   - No Storybook / Chromatic story for the component.
2. Fire as a hint: "this file deserves visual review on PR."

**Severity.** `low` advisory. **Confidence.** `0.70`.

**Note.** This is not a screenshot engine. It's a recommendation
that the team's existing tooling (Playwright, Storybook, Chromatic)
be applied. The agent guidance line points there.

---

## 10. Duplication detectors

Three detectors with explicit overlap reconciliation against
already-shipped petty crimes.

### 10.1 Overlap audit vs petty crimes

| Already shipped (0.3.0) | New in 0.6.0 | Reconciliation |
| --- | --- | --- |
| `magic_domain_literal_scatter` (repeated domain literals) | (none — covered by petty crime) | The 0.6.0 duplication track does **not** add a "repeated literals" detector. `magic_domain_literal_scatter` is the slot. Consider sharpening the existing detector in 0.7.0 based on evidence. |
| `concept_alias_drift` (concept-name drift across files) | `duplicated_role_status_plan_check` (10.3) | Different evidence: alias drift is _names_, duplicated check is _logic_. Both can fire on the same area without contradiction. Document the relationship in `docs/finding-types/duplication.md`. |
| `return_shape_roulette` (one function returns divergent shapes) | (none) | Petty crime stays; the 0.6.0 duplication track is about cross-file duplication, not within-function divergence. |

### 10.2 `exact_duplicate_block` — Exact Duplicate Block

**Detects.** Identical function bodies (modulo whitespace + comments)
across ≥ 2 files.

**Heuristic.** Uses AST hashing (§4.3) `exact` field. Group functions
by exact hash; fire when ≥ 2 distinct files share an exact hash AND
the token count is ≥ 20 (skip trivial helpers).

**Severity.** `medium`. **Confidence.** `0.95`.

**Evidence.** Lists every file + line range sharing the hash. Cap at
5 sites; "+N more" overflow.

### 10.3 `near_duplicate_block` — Near-Duplicate Block

**Detects.** Same as 10.2 but using the `shape` hash. Catches
copy-pasted functions where local variable names were renamed.

**Severity.** `medium`. **Confidence.** `0.85` (lower than exact —
the shape hash has known collision risk on small bodies).

**Token threshold.** ≥ 40 tokens (higher than exact, since shape
hashes collide more easily on small bodies).

### 10.4 `duplicated_role_status_plan_check` — Duplicated Policy Logic

**Detects.** The same role / status / plan check appears across
multiple files with subtly different conditions.

**Heuristic.**

1. Find AST subtrees matching `*.role === "X"` /
   `user.permissions.includes("X")` / `plan === "Y"` /
   `status === "Z"` patterns.
2. Group by the literal string (`X`, `Y`, `Z`) being checked.
3. Fire when ≥ 3 files check the same literal and the comparison
   shapes differ (some check `===`, others check `!==`, others have
   compound conditions).

**Severity.** `medium`. **Confidence.** `0.70`.

**Evidence.** Lists the files + line ranges + the exact comparison.

**Overlap with `concept_alias_drift`.** Both fire on
role/status/plan domains. The distinction:

- `concept_alias_drift` fires on the **names** drifting (e.g.,
  "admin" / "owner" / "manager" used interchangeably).
- `duplicated_role_status_plan_check` fires on the **comparison logic
  being copy-pasted** with subtle differences (e.g., `role === "admin"`
  in one file vs `role === "admin" || role === "owner"` in another).

Both can fire on the same area; together they're the full picture.

---

## 11. M5 — Full `/docs` site

### Stack

Astro + Starlight, deployed alongside the existing landing page.
Per `CLAUDE.md`: "Website: Astro + Starlight preferred over Next.js
(docs-led site)."

### URL plan

- `crimes.sh/` — existing landing page (unchanged).
- `crimes.sh/docs/` — new Starlight docs root.

### Content migration

Every existing `docs/*.md` becomes a Starlight page:

| Existing file | New URL |
| --- | --- |
| `docs/agent-usage.md` | `/docs/agent-usage/` |
| `docs/ci.md` | `/docs/ci/` |
| `docs/json-schema.md` | `/docs/json-schema/` |
| `docs/configuration.md` | `/docs/configuration/` |
| `docs/suppressions.md` | `/docs/suppressions/` |
| `docs/explain.md` | `/docs/explain/` |
| `docs/releasing.md` | `/docs/releasing/` |
| `docs/skills.md` | `/docs/skills/` |
| `docs/finding-types/ia.md` | `/docs/finding-types/ia/` |
| `docs/finding-types/petty.md` | `/docs/finding-types/petty/` |
| `docs/releases/v0.4.0.md` | `/docs/releases/v0.4.0/` |
| `docs/releases/v0.5.0.md` | `/docs/releases/v0.5.0/` |
| `docs/releases/v0.6.0.md` | `/docs/releases/v0.6.0/` (new — release notes) |

Plus new pages for 0.6.0:

- `/docs/finding-types/structural/` — large_function, large_file,
  todo_density, direct_date.
- `/docs/finding-types/dependency/` — circular_dependency,
  deep_import, high_fan_in_fan_out, layer_violation.
- `/docs/finding-types/frontend/` — the six 9.x detectors.
- `/docs/finding-types/duplication/` — the three 10.x detectors.
- `/docs/scoring/` — per-finding scores explainer.

### Implementation note

The existing markdown files are the source of truth. Starlight reads
them in place rather than duplicating content. The site build step
copies them into the Astro routing tree at build time. This keeps
`docs/**` directly consumable for agents that read raw markdown via
GitHub.

### Tests

A site-build smoke test in CI: `pnpm --filter @crimes/website build`
must succeed AND produce HTML for every page in the URL plan.

---

## 12. Polish: stderr breadcrumb for wholesale `detectors.disable`

When `crimes.config.json` disables ≥ 3 detectors, the CLI prints to
stderr (once per invocation) on `scan` / `context` / `diff`:

```
crimes: detectors.disable removed 5 detectors from this run.
        Consider per-finding `crimes ignore` for narrow exceptions.
```

Suppressed when `detectors.disable.length < 3`. Suppressed when the
caller passes `--no-color` (alongside other diagnostic output).

Small surface — one config check at engine startup, one stderr write.

---

## 13. JSON schema implications

All additions are optional / additive. No `schema_version` bump.

### Per-finding

```ts
interface FindingScores {
  // existing
  severity: number;
  confidence: number;
  agent_risk?: number;
  // moves from "reserved" to "computed" (always set after 0.6.0)
  blast_radius?: number;
  churn?: number;
  test_gap?: number;
}
```

The three new score fields are no longer documented as "reserved" —
they're computed by every scan once the import graph + scoring
context are in place.

### New finding types

Adds `Finding.type` values:

- `layer_violation`
- `circular_dependency`
- `deep_import`
- `high_fan_in_fan_out`
- `orphaned_destination`
- `parallel_destination`
- `permission_ia_drift`
- `action_label_drift`
- `command_drift_docs_code_drift`
- `design_token_escape`
- `accessible_interaction_risk`
- `duplicate_component_shape`
- `responsive_fragility`
- `copy_ia_drift`
- `visual_regression_review_hint`
- `exact_duplicate_block`
- `near_duplicate_block`
- `duplicated_role_status_plan_check`

All land additively under the same `schema_version`. Consumers that
read by `Finding.type` value will see new types; consumers that
pattern-match on the full set should be updated.

### `imports_limited` on `ScanReport`

When the import graph hit its performance budget and was truncated,
`ScanReport.imports_limited?: true` and
`ScanReport.imports_limited_reason?: string` are set. Same shape as
`HotspotsReport.history_limited` from 0.4.0.

### `category` on `Finding`

The PRD §10 mentioned categorising findings. Petty crimes plan §3
proposed `category?: "structural" | "change_risk" | "duplication" |
"testability" | "domain" | "agent_risk"`. Add it as an optional field
on `Finding`. Existing detectors populate it as a backfill in this
release; consumers can group findings by category.

### Stability

Document each addition in `docs/json-schema.md` under the relevant
section. The unified `agent_risk` formula gets its own subsection
under "Stability guarantees" — flag that the exact weighting may
shift between minor releases (ordinal, not absolute).

---

## 14. CI implications

All `--fail-on` gates continue to work unchanged. The new detectors
fire alongside the existing ones; their findings are subject to the
same suppression / baseline / fail-on contract.

### Severity calibration concern

If 0.6.0 ships 16 new detectors at default thresholds, repos that
adopt `crimes baseline check --fail-on medium` may suddenly see many
new findings that weren't present in their baseline. The baseline
file pins fingerprints, so the **new** detector findings are by
definition not in the baseline.

**Mitigation 1:** All new detectors default to `medium` severity at
most, never `high` (except `circular_dependency` at ≥ 3 files —
documented). The default `crimes baseline check --fail-on medium`
gate will surface them but the team can re-snapshot the baseline
after upgrading. `0.6.0` release notes call this out explicitly:
"After upgrading, run `crimes baseline save` to re-pin the baseline,
or use `--fail-on high` until you've audited the new findings."

**Mitigation 2:** A new `--include-new-detectors` opt-out flag on
`baseline check` is **not** in 0.6.0 — too clever; the
re-snapshot path is simpler.

### Suppression count growth

Suppression files may grow when teams upgrade. Mitigation: existing
`crimes audit-suppressions` (0.5.0) is the audit path.

---

## 15. Tests and fixtures

### New unit tests

| Module | Tests |
| --- | --- |
| `imports/build.test.ts` | 7-8 (per §4.1) |
| `jsx/walk.test.ts` | 5-6 (per §4.2) |
| `ast-hash/hash.test.ts` | 5-6 (per §4.3) |
| `scoring/build.test.ts` | 8-10 (per §4.4) |
| Each new detector (`detectors/*-detector.test.ts`) | 4-6 (heuristic fire, near-miss no-fire, false-positive guard, severity ramp, evidence shape) |

Rough new-test count: ~120-150 tests.

### Fixture extension

`examples/messy-ts-app` extended with:

- A multi-file React surface (currently just route stubs) to exercise
  the frontend detectors.
- A small import-cycle pair (`a.ts ↔ b.ts`) to exercise
  `circular_dependency`.
- A `tailwind.config.ts` plus hard-coded hex colors in a JSX file to
  exercise `design_token_escape`.
- A `<div onClick={...}>` without a label to exercise
  `accessible_interaction_risk`.
- Three files with identical function bodies to exercise
  `exact_duplicate_block`.
- A `crimes.config.json` extended with sample `architecture.layers`
  + `architecture.rules` to exercise `layer_violation`.

The pinned fixture output (`docs/fixtures/messy-ts-app.json`)
regenerates after each batch lands.

### Integration / smoke

The publish-tarball smoke test (`pnpm --filter crimes smoke`) gains
two checks:

- Output of `crimes scan --format json` on the fixture contains at
  least one finding of each new `Finding.type`.
- Output of `crimes scan --format json` contains `scores.churn` /
  `scores.test_gap` / `scores.blast_radius` on at least one finding.

---

## 16. Docs and website updates

### Existing docs to update

- `README.md` — status section, command table, detector tables. Add
  a "Risk profile" callout explaining the new scores.
- `docs/agent-usage.md` — surface-status table; new "How to read
  scores" subsection; new section on each new detector category.
- `docs/json-schema.md` — every additive field; new `Finding.type`
  values; the unified `agent_risk` formula caveat.
- `docs/ci.md` — baseline re-snapshot recommendation post-upgrade.
- `docs/configuration.md` — architecture.layers section graduates
  from "reserved" to "consumed by `layer_violation`."
- `docs/suppressions.md` — small note on the audit-suppressions
  flag for stale entries (already shipped).
- `ROADMAP_STATUS.md` — milestone status, new "Shipped in 0.6.0"
  block.
- `AGENTS.md` — shipped-vs-deferred surface, new detector names.
- `.claude/skills/crimes/SKILL.md` — new detector categories, the
  scoring story.

### New docs

- `docs/finding-types/structural.md` — 0.1.0 detectors.
- `docs/finding-types/dependency.md` — §6, §7 detectors.
- `docs/finding-types/frontend.md` — §9 detectors.
- `docs/finding-types/duplication.md` — §10 detectors.
- `docs/scoring.md` — the unified `agent_risk` formula + per-score
  explanations.
- `docs/releases/v0.6.0.md` — release notes.

### Website

- `apps/website/src/llms.txt` — replace "Not shipped yet" entries
  that 0.6.0 ships; add a "Shipped in v0.6.0" block.
- `apps/website/src/index.html` — hero pill, FAQ, roadmap section.
- `apps/website/` — Astro+Starlight integration for the new
  `/docs` site (§11).

---

## 17. Risks and mitigations

### Scope risk

0.6.0 is materially larger than any prior release. ~16 new detectors,
three pieces of new infrastructure, M5 docs site, plus polish.

**Mitigation:**

1. **Foundation-first sequencing.** §18 puts the import graph, JSX
   layer, AST hashing, and scoring data sources first — three to
   four prompts before any detector touches the new infrastructure.
   Each foundation prompt is independently shippable: build → typecheck
   → test → commit before the next.
2. **Detector prompts batched by infrastructure.** Once a foundation
   ships, the detectors that consume it batch into one prompt each.
3. **Each detector lands with conservative confidence.** New
   detectors default to `low`–`medium` severity at the heuristic
   thresholds named in this plan. 0.7.0 is when severity / confidence
   curves get tuned to evidence.
4. **Explicit ship-vs-defer per detector.** Every detector in §6-10
   has a "must-ship" tag. If a detector proves harder than expected,
   defer it to 0.7.0 evidence-tuning rather than rush a noisy
   detector into the release.

### Noise risk

Shipping 16 new detectors at once before structured testing means
each detector ships with whatever false-positive shape its first
implementation has. The 0.4.0 lesson was that noise erodes trust
faster than missing detectors do.

**Mitigation:**

1. **Conservative defaults across the slate.** No new detector
   defaults to `high` severity (with one named exception:
   `circular_dependency` ≥ 3 files).
2. **"Appears to" / "may" phrasing.** Every new detector summary
   uses hedged language, matching the IA detector convention.
3. **The 0.7.0 milestone explicitly addresses this.** 0.6.0 ships
   the slate; 0.7.0 runs structured Claude + Codex testing across the
   slate and tunes severity / confidence / threshold curves based on
   evidence.
4. **Dogfood appendix (§20) flags known noise vectors from 0.5.0.**
   The plan ships with explicit eyes-open on what the existing
   detectors get wrong; the new detectors inherit those lessons.

### Schema-bloat risk

15+ new `Finding.type` values plus three score fields newly populated.

**Mitigation:** All additions optional / additive. `schema_version`
stays at `"0.1.0"`. Consumers that read by key name (the documented
pattern) are unaffected.

### Performance risk

Building the import graph + scoring context + AST hashes is more
work than any prior release added per scan.

**Mitigation:**

1. Performance budgets named per infrastructure module (§4.1: 200ms;
   §4.3: 500ms aggregate).
2. Lazy / cached computation — import graph and scoring context are
   built once per scan and shared via `DetectorContext`.
3. Budget overruns set `imports_limited` / `history_limited` flags
   rather than failing. Agents downweight rankings on limited runs.

### Detector overlap / double-firing risk

Several new detectors overlap with already-shipped detectors
(documented in §10.1). Without explicit reconciliation, the same
evidence could fire two findings.

**Mitigation:**

1. §10.1 names every known overlap and the resolution.
2. New `docs/finding-types/duplication.md` documents the relationship
   between `magic_domain_literal_scatter`, `concept_alias_drift`,
   and the new duplication detectors.
3. Each new detector's `false-positive risks` section calls out
   adjacent already-shipped detectors and how the new one differs.

### M5 docs-site delivery risk

Astro+Starlight migration is non-trivial — every existing doc moves,
and a new site build needs to be wired into deployment.

**Mitigation:**

1. Migration is mechanical (markdown stays, only the routing
   shell is new).
2. Site can land in a separate prompt at the end, after detectors are
   stable. If 0.6.0 ships without M5, the prior landing page stays.
3. Re-evaluate "should this be its own release" if the migration
   proves bigger than expected — but the default assumption is M5
   lands with 0.6.0.

---

## 18. Implementation prompt sequence

15 prompts. Each lands on `main` independently with passing build /
typecheck / test before the next starts.

### Foundation phase (Prompts A–D)

#### Prompt A — Import graph

Build `packages/core/src/imports/build.ts` + `index.ts`. Wire into
`DetectorContext` as `ctx.imports?: ImportGraph`. Add tests per §4.1.
Update `packages/core/src/index.ts` exports.

**Done when:** `buildImportGraph` produces a correct graph on the
fixture; `ctx.imports` is available to every detector (no detector
consumes it yet); all tests pass.

#### Prompt B — JSX inspection layer

Build `packages/core/src/jsx/walk.ts` + `index.ts`. Use the existing
`language-js` AST. Add tests per §4.2.

**Done when:** `walkJsx` on a fixture file with mixed JSX shapes
returns the expected element tree; tests pass.

#### Prompt C — AST hashing

Build `packages/core/src/ast-hash/hash.ts` + `index.ts`. Add tests
per §4.3.

**Done when:** `hashFunction` and `hashJsxSubtree` produce stable
hashes; identical inputs → identical hashes; renamed identifiers →
same shape hash, different exact hash; tests pass.

#### Prompt D — Scoring data sources + per-finding scores backfill

Build `packages/core/src/scoring/build.ts` + `index.ts`. Wire into
`DetectorContext` as `ctx.scoring: ScoringContext`. Update every
detector to populate `scores.churn` / `scores.test_gap` /
`scores.blast_radius` from `ctx.scoring`. Update the unified
`agent_risk` computation in `core` so detectors no longer set it
directly.

Update `docs/json-schema.md` to mark the three new score fields as
"populated by every scan" (no longer "reserved"). Update
`docs/scoring.md` with the unified formula.

**Done when:** every finding in `crimes scan` JSON output carries
real `churn` / `test_gap` / `blast_radius` values; the unified
`agent_risk` formula matches the spec; tests pass; the human
reporter's "Risk profile" line shows on the bundled fixture.

### Detector phase (Prompts E–L)

Order: architecture (depends on import graph), then dependency,
then IA-completion, then frontend (depends on JSX layer + sometimes
AST hashing), then duplication (depends on AST hashing).

#### Prompt E — Architecture-layer enforcement

Build `packages/core/src/detectors/layer-violation.ts`. Consumes
`ctx.imports` + the 0.5.0 `architecture` config. Add tests per §6.

**Done when:** layer violations fire correctly on a fixture with
both legal and forbidden cross-layer imports; false-positive guards
trip on test files and on files outside any layer; tests pass.

#### Prompt F — Dependency-graph detectors

Build `circular-dependency.ts`, `deep-import.ts`, and
`high-fan-in-fan-out.ts`. Consumes `ctx.imports`. Add tests per §7.

**Done when:** a fixture cycle fires `circular_dependency`; a
fixture file with `lib/dist/internal/x` import fires `deep_import`;
a fixture utility module imported by 50+ files fires
`high_fan_in_fan_out`; tests pass.

#### Prompt G — IA completion batch 1: orphaned + parallel destination

Build `orphaned-destination.ts` and `parallel-destination.ts`.
Consumes the existing IA index. Add tests per §8.1, §8.2.

**Done when:** a fixture route file with no nav reference fires
`orphaned_destination`; two route files sharing tokens fire
`parallel_destination`; tests pass.

#### Prompt H — IA completion batch 2: permission + action label + command drift

Build `permission-ia-drift.ts`, `action-label-drift.ts`, and
`command-drift-docs-code-drift.ts`. Tests per §8.3, §8.4, §8.5.

**Done when:** a fixture with nav-vs-route guard mismatch fires
`permission_ia_drift`; a fixture with three "Delete"/"Remove"/"Archive"
buttons fires `action_label_drift`; a docs file referencing a missing
subcommand fires `command_drift_docs_code_drift`; tests pass.

#### Prompt I — Frontend batch 1: token escape + accessible interaction

Build `design-token-escape.ts` and `accessible-interaction-risk.ts`.
Consumes `ctx.jsx`. Tests per §9.1, §9.2.

**Done when:** a fixture component with hard-coded `#abc` colors
when `tailwind.config.ts` defines them fires `design_token_escape`;
a fixture `<div onClick>` without `role`/`aria-label` fires
`accessible_interaction_risk`; tests pass.

#### Prompt J — Frontend batch 2: duplicate component + responsive fragility

Build `duplicate-component-shape.ts` and `responsive-fragility.ts`.
Consumes `ctx.jsx` + (for duplicate) `ctx.astHash`. Tests per §9.3,
§9.4.

**Done when:** a fixture with three near-identical Card components
fires `duplicate_component_shape`; a fixture with `width: 800px`
+ `fontSize: 24px` + no media query fires `responsive_fragility`;
tests pass.

#### Prompt K — Frontend batch 3: copy/IA drift + visual regression hint

Build `copy-ia-drift.ts` and `visual-regression-review-hint.ts`.
The first shares its core logic with the 8.4 action-label-drift
detector — reuse where appropriate. Tests per §9.5, §9.6.

**Done when:** a fixture with inconsistent button copy fires
`copy_ia_drift`; a UI file with churn + responsive fragility + no
test imports fires `visual_regression_review_hint`; tests pass.

#### Prompt L — Duplication batch

Build `exact-duplicate-block.ts`, `near-duplicate-block.ts`, and
`duplicated-role-status-plan-check.ts`. Consumes `ctx.astHash`.
Overlap audit (§10.1) reflected in the detectors' false-positive
guards. Tests per §10.

**Done when:** a fixture with three copies of a 30-line function
fires `exact_duplicate_block`; a fixture with the same logic and
renamed identifiers fires `near_duplicate_block`; a fixture with
`role === "admin"` checks across 3 files fires
`duplicated_role_status_plan_check`; tests pass.

### Polish + release prep phase (Prompts M–O)

#### Prompt M — Polish: stderr breadcrumb + should-ship items

Build the stderr breadcrumb for wholesale `detectors.disable`
(§12). Land should-ship items 13 (`cli_command_registrar` shape)
and 14 (`crimes hotspots` enclosing-repo lookup) if scope allows.
Tests per each.

**Done when:** a fixture with 5 disabled detectors emits the stderr
line; the `cli_command_registrar` shape recognises Commander DSL
register functions; `crimes hotspots <subdir>` finds churn via the
enclosing git repo; tests pass.

#### Prompt N — M5: Astro + Starlight docs site

Migrate every `docs/**/*.md` into a Starlight-routed site at
`apps/website/src/docs/`. Update the Astro build to produce the
site. Wire deployment.

**Done when:** `pnpm --filter @crimes/website build` produces a
`/docs/` tree with every existing markdown page rendered; the
Astro deployment workflow has been adjusted; the existing landing
page is unaffected.

#### Prompt O — Docs, schema, fixture, release prep

Update every doc per §16. Regenerate the bundled fixture output
(`docs/fixtures/messy-ts-app.json`) with the new detectors firing.
Update `ROADMAP_STATUS.md`. Bump `packages/cli/package.json` to
`0.6.0`. Draft `docs/releases/v0.6.0.md`. Update the website hero
pill and llms.txt. Run the full smoke test.

**Done when:** `pnpm build && pnpm typecheck && pnpm test && pnpm
--filter crimes smoke && pnpm --filter @crimes/website build` are
all green; a draft release-notes file is committed.

### Sequencing rationale

- **A before everything.** The import graph is consumed by D, E, F,
  and downstream scoring of every detector. Ship it first.
- **B before I–K.** JSX layer is the foundation of every frontend
  detector.
- **C before J, L.** AST hashing feeds duplicate-component and the
  duplication batch.
- **D before E–L.** Scoring backfills every detector. The detector
  prompts that follow can populate scores naturally rather than
  retrofitting later.
- **E before F.** Layer enforcement is the foundational test of the
  import graph + config layer integration. Cleaner to ship before
  the three other dependency-graph detectors.
- **G, H, I, J, K, L can ship in any order after their foundation
  prompt is in.** Sequencing in this plan is convenience; parallelise
  if multiple agents can land them concurrently.
- **M before N.** Polish first; M5 docs site is a larger surface
  that benefits from a stable detector slate.
- **N before O.** Docs site has to ship before docs-update prompt
  can include site-specific updates.

---

## 19. Success criteria

`crimes@0.6.0` ships when all of the following are true:

1. **Foundation infrastructure is in place.** Import graph + JSX
   inspection + AST hashing + scoring data sources all exposed via
   `DetectorContext`. No detector duplicates the work of another.
2. **Every finding carries real per-finding scores.** `scores.churn`,
   `scores.test_gap`, `scores.blast_radius` populated by default on
   every scan. The unified `agent_risk` formula is documented.
3. **Architecture-layer enforcement is live.** `architecture.layers`
   + `architecture.rules` in `crimes.config.json` drives
   `layer_violation` findings.
4. **All 18 new detector types fire on the fixture.**
   `examples/messy-ts-app` exercises each named detector.
5. **No regressions on existing detectors.** Every 0.5.0 detector
   still fires on the fixture; their findings now carry real scores.
6. **The M5 `/docs` site is live.** Every existing markdown page
   renders under `crimes.sh/docs/`; the existing landing page is
   unchanged.
7. **Polish stderr breadcrumb fires when applicable.** A fixture
   `crimes.config.json` with 5 disabled detectors emits the
   one-line stderr notice.
8. **Schema unchanged where required.** `schema_version` stays at
   `"0.1.0"`. All additions are optional / additive.
9. **No new commands.** 0.6.0 is a detector + scoring release; the
   CLI command surface is unchanged from 0.5.0.
10. **Build / typecheck / test / smoke are all green.** `pnpm build
    && pnpm typecheck && pnpm test && pnpm --filter crimes smoke
    && pnpm --filter @crimes/website build`.
11. **Docs are complete.** `docs/json-schema.md`, `docs/scoring.md`,
    every `docs/finding-types/*.md`, and the README list every new
    detector and finding type.
12. **Release notes drafted.** `docs/releases/v0.6.0.md` carries the
    full surface inventory, the noise-disclaimer for new detectors,
    the post-upgrade `crimes baseline save` recommendation, and a
    clear pointer at 0.7.0 as the structured-testing milestone.
13. **No new CLI surface.** `0.6.0` deliberately does not add new
    commands; that's a 0.5.0-style release. Every new capability
    surfaces via existing commands' output.

If any of 1, 2, 4, 10 fail, the release is not ready. 3, 5, 6, 7,
11, 12 are must-ship but smaller surface; 8, 9, 13 are stability
gates that should be effortless.

---

## 20. Appendix A — `crimes@0.5.0` dogfood signal

`crimes` was installed globally from npm (`npm install -g crimes` →
`crimes@0.5.0`) and run against the crimes monorepo during the
drafting of this plan. The observations below are first-hand evidence
that informs both the 0.6.0 scope (especially should-ship items 13
and 14) and the 0.7.0 testing baseline.

### Findings on `crimes scan packages docs`

**Total: 68 findings (9 high, 49 medium, 10 low).**

### Dominant false-positive pattern: Commander `register*Command`

The single largest cluster of God Function findings on the crimes
monorepo's own code is the Commander.js builder DSL pattern. Eight
register functions flagged:

- `registerIgnoreCommand` (171 lines)
- `registerBaselineCommand` (138 lines)
- `registerScanCommand` (124 lines)
- `registerExplainCommand`, `registerUnignoreCommand`,
  `registerDiffCommand`, `registerVerdictCommand`,
  `registerContextCommand`, `registerAuditSuppressionsCommand`
  (90–130 lines each)

These bodies are mostly `.command().description().option(...)
.option(...).action(async () => { ... })` chains. They are not
"mixed responsibilities" — they are registration DSL invocations.
The action callback INSIDE the chain (e.g.,
`cli/src/commands/ignore.ts:59-196 (<anonymous>)`) double-flags as
a second God Function.

**0.6.0 should-ship item 13** addresses this: a
`cli_command_registrar` shape, mirroring 0.4.0's `react_component`
and `page_export` shapes. 200-line threshold at low severity. Same
pattern, well-understood implementation.

### False-positive pattern: `direct_date` in tests

`core/src/suppressions.test.ts` flagged at high severity for "10
direct uses of `Date.now()` / `new Date()`." The uses are all
intentional test-time injection (`now: () => new Date(NOW_ISO)`).

The 0.4.0 `large_function` shape work added `test_callback` shape
recognition. The same idea applies here: `direct_date` should
recognise a `test_file` shape (file name matches `*.test.ts`,
`*.spec.ts`, `__tests__/...`) and either skip emission or downgrade
severity. **Defer to 0.7.0** evidence-driven tuning — this is exactly
the kind of detector calibration the structured testing milestone
should handle.

### False-positive: `todo_density` on its own source

`core/src/detectors/todo-density.ts` fires `todo_density` (20
markers, 181.8 per 1k LOC) on itself because the file contains the
regex pattern `"TODO|FIXME|XXX|HACK"` as a literal string. The
markers are signal strings the detector is searching for, not actual
TODOs.

Two fix paths: (a) the detector excludes its own source file by
filename; or (b) the detector distinguishes "marker in comment" from
"marker in string literal." Path (b) is cleaner; path (a) is a
one-line allowlist. **Defer to 0.7.0** evidence-driven tuning.

### Legitimate `God File` findings worth noting

- `language-js/src/parse.ts` (943 lines, 35 top-level functions) —
  legitimately large AST classifier. Splitting it has real cost.
- `reporter/src/human.ts` (826 lines, 34 top-level functions) —
  reasonable candidate for splitting per-report formatter into its
  own file.
- `reporter/src/reporter.test.ts` (910 lines, 57 top-level functions)
  — 57 `it` blocks. Tests legitimately grow large. Should-ship item
  13 (`cli_command_registrar` shape) is one example of shape-aware
  exemptions; a `test_file` shape exemption is a similar follow-up
  (could-ship item 16).
- `core/src/context.test.ts` (524 lines, describe callback 491
  lines) — also a test file, same shape gap.

### `crimes hotspots <subdir>` ergonomic gap

Running `crimes hotspots packages --since 90d` from the monorepo
root reports "not a git repo" and degrades to severity-only ranking.
The crimes monorepo IS a git repo; the `packages` subdirectory is
not its own git root.

**Should-ship item 14** addresses this: walk upward from the scan
root to find the enclosing git repo for churn purposes; keep
findings scoped to the passed path.

### `crimes context` quality

Context output on `packages/core/src/scan.ts` correctly surfaced:

- Two real findings (God Function on `scan`, God File on the module).
- Agent guidance keyed to both finding types.
- Related files including legitimately related modules
  (`audit-suppressions`, `baseline`, `config`).
- Likely tests (`scan.test.ts`, `config.test.ts`,
  `explain.test.ts`, `suppressions.test.ts`).

The neighbourhood `related_files` heuristic worked well — the
"same directory" reason fired correctly, and on
`detectors/large-function.ts` the shared-domain-token heuristic
("shares domain token \"detectors\"") added value.

### `crimes audit-suppressions` confirmation

On a clean repo with no `.crimes/suppressions.json`, the command
correctly reports "No suppressions file found. Nothing to audit —
run `crimes ignore` to add one." Exit code 0.

### `crimes explain` confirmation

`crimes explain crime_00001 --from <saved-scan.json>` produces the
full long-form rationale + the verbatim `crimes ignore` command line.
The output is well-formatted and scannable. The "Why it matters"
paragraph is general-purpose (it's the per-detector
`whyItMatters` field); per-finding specificity would require
structural analysis (out of scope).

### Signal for 0.7.0 testing baseline

This appendix is the 0.5.0 noise baseline. The 0.7.0 structured
testing milestone should:

1. Re-run the same self-scan after 0.6.0 lands.
2. Compare to this baseline — which new detectors added signal,
   which added noise.
3. Use the comparison to drive severity / confidence / threshold
   tuning for 0.8.0+.

The 0.5.0 baseline (this appendix) is roughly:

- 9 high-severity findings, of which 3 are arguable false positives
  (Commander DSL × 3 highest-severity register functions; if the
  `cli_command_registrar` shape lands in 0.6.0, this should drop to
  6 legitimate highs).
- 49 medium-severity findings, of which many are the Commander DSL
  bodies + their anonymous action callbacks (shape exemption
  resolves both).
- 10 low-severity findings — mostly real petty crimes worth fixing.

A reasonable 0.6.0 target: the self-scan delta with the
`cli_command_registrar` shape applied should drop the high count to
≤ 6 and the medium count by 10-15.

---

## Appendix B — What this plan deliberately doesn't do

It does not add new CLI commands. 0.5.0 was the product-surface
release; 0.6.0 is the detector-and-scoring release. Every new
capability surfaces through existing commands.

It does not address suppressions UX further. The 0.5.0 plan made
those calls; the user has reaffirmed them. `expires_at`, `owner`,
custom matchers, severity overrides — all deferred until requested.

It does not commit to the 0.7.0 evidence-hook design. That's its
own plan. This plan does, however, end with a concrete dogfood
appendix (§20) that the 0.7.0 plan can use as a starting baseline.

It does not migrate to a Rust core. Same wedge as every prior
release: TypeScript on Node, deterministic, local, JSON-first, no
LLM.
