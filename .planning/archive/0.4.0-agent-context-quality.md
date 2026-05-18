# `crimes@0.4.0` — Agent Context Quality and Signal-to-Noise

Planning document for the next release. Nothing here ships until a
follow-up branch implements it. The authoritative spec stays `PRD.md`;
the live milestone tracker stays `ROADMAP_STATUS.md`; this file is the
0.4.0 plan handed to the implementation agents.

- **Repo state at planning time:** `crimes@0.3.0` (IA crimes) shipped to
  npm and `main`. CLI surface: `scan`, `scan --changed [--base]
  [--fail-on]`, `context`, `hotspots`, `diff`, `baseline save/check`,
  `verdict`. Detectors: structural (`large_function`, `large_file`,
  `todo_density`, `direct_date`) + IA (`missing_agent_context`,
  `route_metadata_drift`, `duplicated_navigation_source`,
  `concept_alias_drift`, `docs_code_drift`). Schema:
  `schema_version: "0.1.0"`.
- **Constraint:** do not change shipped CLI behaviour, do not bump the
  package version, do not edit the website yet. This plan only describes
  the work; a follow-up implementation pass writes the code.

The previous 0.4.0 tentative theme was _suppressions and config_. Real-repo
trials of 0.3.0 with Claude and Codex shifted the priority — see §1
below — and suppressions / config should move to 0.5.0.

---

## 1. Product framing

**Recommended `0.4.0` theme: _agent context quality and signal-to-noise_.**

The 0.3.0 release added IA detectors that surface ambiguity across files.
Live trials of 0.3.0 against real repos with Claude Code and Codex CLI
exposed two coupled problems that overshadow the next detector:

1. `crimes` is **strongest when it tells an agent what else to read
   before editing.** `crimes context <file>` is the highest-leverage
   command in the product. Today it returns findings on the target file
   plus IA `related_files` when the target happens to anchor an IA
   finding, but it does **not** answer the next question an agent
   actually asks: _"what else in this repo is likely relevant to this
   change?"_ A handler at `api/admin/.../route.ts` has no link to
   `lib/admin-auth.ts`. A route file has no link to its sibling layout.
   This is the wedge — domain neighbourhood awareness.

2. `crimes` is **weakest when noisy findings cause agents to ignore the
   report.** Real repos triggered `large_function` on React pages,
   Next.js route handlers, and `describe()` callbacks at 60–80 lines.
   `docs_code_drift` fired on every `../../issues` link in a README.
   `crimes context` from a monorepo root returned no findings on a file
   inside a nested package. Agents quickly learn to discount a report
   that wastes their tokens. Every false positive erodes the trust
   needed to act on a real one.

Both classes are about the same thing: **context quality**. The next
detector will not help if agents have already learned to ignore the
ones that ship. Fix the ones that fire first, then earn the right to
add more.

### Why this theme over the previous candidates

- **A. Deeper IA coverage** — still on the long-term roadmap; explicitly
  pre-empted by the "no new detectors before fixing noise" feedback.
  `orphaned_destination`, `parallel_destination`, etc. only earn their
  keep once the existing slate is low-noise on real repos.
- **B. Per-finding scores (M2)** — touches every detector, so it's a
  bigger surface than one minor release can absorb cleanly. Holds.
- **C. Suppressions and config** — _was_ the previous tentative theme.
  Real adopters did not complain about "I can't silence this finding";
  they complained about "I don't trust this finding." Suppressions
  paper over false positives; fixing the detectors removes them. Move
  suppressions to 0.5.0 once 0.4.0 has stabilised the signal.

The wedge is unchanged: deterministic, local, JSON-first, no LLM. This
release strengthens it by raising the floor of context quality and
lowering the noise ceiling.

---

## 2. Recommended 0.4.0 scope

### Must ship

The minimum bar for the release.

1. **Monorepo / nested-package root detection for `crimes context`.**
   Passing a file inside `examples/messy-ts-app/...` from the monorepo
   root resolves the right scan scope today; passing the same file from
   inside `examples/messy-ts-app/` returns findings. The
   command must behave identically from either invocation. See §3.
2. **Domain / neighbourhood related-file discovery for `crimes
   context`.** A new deterministic neighbourhood pass that adds a
   top-level `related_files` (or `neighbourhood`) block to the
   `ContextReport` listing files an agent should read before editing
   the target. See §4.
3. **Shape-aware `large_function` thresholds.** Classify each function
   into `domain | test_callback | react_component | route_handler |
   page_export | unknown` and apply per-shape thresholds. Test callbacks
   stop firing at 60 lines; route handlers fire at 100; pages /
   components fire at 200. See §5.
4. **`_test.ts` / `_test.js` likely-test discovery.** The current regex
   misses Go-style `name_test.ts` and `name_spec.ts` next to a target.
   See §6.2.
5. **`docs_code_drift` GitHub-relative link allowlist.** Stop flagging
   `../../issues`, `../../issues/new`, `../../pull/123`, `../../wiki`,
   `../../discussions`, `../../releases`, `../../actions`,
   `../../compare`, `../../blob/...`, `../../tree/...`. See §5.6.
6. **`scan --changed` top-level `changed_files`.** Include every file
   the changed-files resolver returned, even when none of them produced
   findings. Agents lose track of which files they actually touched
   otherwise. See §6.3.

### Should ship

Worth doing in 0.4.0 if scope allows. Higher leverage than yet-another
detector but smaller surface than the must-ship items.

7. **Top-level placement and prominence of `agent_guidance` in
   `ContextReport` JSON.** Move `agent_guidance` ahead of `findings` and
   `likely_tests` in the serialised order so it is the first useful
   block an agent reads after `risk`. The field is already top-level —
   this is a serialisation order tweak plus a docs callout.
8. **Empty-field self-explanation.** Add `likely_tests_reason` (and
   parallel `agent_guidance_reason`, `related_files_reason`) to
   distinguish "searched, found none" from "not searched / not
   applicable here". Additive optional fields — no schema break.
   See §6.4.
9. **`hotspots` shallow-clone annotation.** Detect shallow clones via
   `git rev-parse --is-shallow-repository` and add `history_limited:
   true` plus `history_limited_reason` to `HotspotsReport`. Agents will
   then know not to over-weight the rankings. See §6.5.
10. **README / docs honesty pass.** Make the deferred detector list
    explicit on the README, on `docs/agent-usage.md`, and on the IA
    finding-types page. Today the table is buried in
    `ROADMAP_STATUS.md`. See §8.

### Could ship

If time allows. None of these block the release.

11. **`crimes scan --changed --baseline <pre-scan.json>`.** A
    self-contained pre/post-edit diff that reuses fingerprint matching
    against an arbitrary `ScanReport` (not just `.crimes/baseline.json`).
    Recommendation: ship the **shape** (accept any `ScanReport` as the
    baseline argument) but defer the new CLI flag plumbing to 0.5.0
    if scope is tight. See §7.
12. **Grouped / noise-collapsed test findings.** When a test file
    produces ≥3 findings of the same type, collapse them to one summary
    finding with a `+N more` evidence line. Shape-aware thresholds (item
    3) should make this mostly unnecessary — re-evaluate after that
    lands.
13. **Shape-specific charges.** Optional split: `large_test_block`,
    `large_react_component`, `large_route_handler` rather than one
    `large_function`. Lower priority than just-fixing-the-thresholds.

### Defer (out of scope for 0.4.0)

- **More IA detectors** — `orphaned_destination`, `parallel_destination`,
  `permission_ia_drift`, `action_label_drift`,
  command-drift `docs_code_drift` variant. Stay on the long-term roadmap;
  pre-empted by the "no more detectors before fixing noise" feedback.
- **Per-finding suppressions / `crimes ignore` / `.crimes/suppressions.json`** —
  move to 0.5.0. Yes, this slips again. Earning trust in the existing
  detectors first removes most of the demand.
- **`crimes init` + `crimes.config.json` plumbing** — moves to 0.5.0 with
  suppressions, where the cluster of config concerns can ship together.
- **Per-finding `scores.churn` / `test_gap` / `blast_radius`** — M2 work.
  Touches every detector and the scoring contract; bigger than 0.4.0
  should absorb.
- **LLM task-aware context / `crimes ask`** — still v1+.
- **Homebrew / standalone binaries (M6)** — wait for CLI stability.

**Recommendation: suppressions should move to 0.5.0.** They are the
right next step _after_ 0.4.0 lands. Doing them first papers over the
noise problems that 0.4.0 fixes at the root.

---

## 3. Context root / package detection (must-ship)

### Symptom

```
# From inside examples/messy-ts-app/:
crimes context src/routes/settings/billing.tsx  → findings

# From the monorepo root:
crimes context examples/messy-ts-app/src/routes/settings/billing.tsx  → no findings
```

### Why it happens

In [`packages/core/src/context.ts`](./packages/core/src/context.ts):

- `root` defaults to `process.cwd()`. From the monorepo root, that is
  the crimes monorepo, not `examples/messy-ts-app`.
- `discoverFiles` walks the configured include patterns from the
  monorepo root. It does pick up
  `examples/messy-ts-app/src/routes/settings/billing.tsx` (excludes
  don't block `examples/`), so the file IS in `allFiles`. Structural
  detectors run.
- The IA index is built over the monorepo, but
  `routeFromFilePath()` in
  [`packages/core/src/ia/extract.ts`](./packages/core/src/ia/extract.ts:57)
  only recognises route prefixes of the form `src/pages/`,
  `src/routes/`, `pages/`, etc. — anchored to the path's prefix. From
  the monorepo root the file's path is
  `examples/messy-ts-app/src/routes/settings/billing.tsx`, which
  starts with neither `src/routes/` nor `routes/`. **Route discovery
  silently drops the file.** That kills `route_metadata_drift` and
  any IA finding that anchors on the route.
- `package.json.bin` discovery in `collectAgentInventory` only looks at
  the repo-root `package.json`. From the monorepo root, the inner
  workspace's `bin` declaration is invisible.

### Plan

Introduce a **scan root resolution** step at the top of `context()`
that picks the right base path for the run.

1. **Resolve the target file to an absolute path** (already done).
2. **Walk upward from the target's directory** to the nearest enclosing
   `package.json`. Stop at filesystem root or the originally-passed
   `--root` (whichever is shallower). Call this the _package root_.
3. **If `--root` was passed explicitly**, honour it — that's the user's
   override and must keep working. Do not climb above it.
4. **If no `--root` was passed and the discovered package root differs
   from `process.cwd()`**, use the package root as the scan root. This
   is the fix for the monorepo case.
5. **Normalise the target file's path against the chosen root** so
   `report.file` is repo-package-relative, the IA index uses
   package-relative paths, and route discovery sees `src/routes/...`
   prefixes again.

In code terms, `context()` gains a new helper:

```ts
function resolveContextRoot(args: {
  targetAbs: string;
  explicitRoot: string | undefined;
  cwd: string;
}): string {
  if (args.explicitRoot) return resolve(args.explicitRoot);
  const pkgRoot = findNearestPackageRoot(args.targetAbs);
  return pkgRoot ?? resolve(args.cwd);
}
```

Where `findNearestPackageRoot` walks `dirname(targetAbs)` upward looking
for `package.json`. It should also respect `pnpm-workspace.yaml` /
`turbo.json` / `lerna.json` as additional monorepo markers — but
`package.json` alone covers >95% of cases and is sufficient for MVP.

### `--root` semantics (unchanged)

- `--root <path>` continues to win unconditionally.
- The CLI command in
  [`packages/cli/src/commands/context.ts`](./packages/cli/src/commands/context.ts:39)
  needs to stop pre-resolving the target against `--root ?? process.cwd()`
  before calling `context()`. Move that resolution into
  `context()` so the package-root discovery can run first. Today the
  CLI passes an already-absolute file path to `context()`, which is
  fine, but it also passes the wrong `root` when invoked from the
  monorepo. Pass `root: options.root` (undefined when not set) and let
  `context()` resolve it.

### Tests

Add cases to a new
`packages/core/src/context.test.ts` (or extend the existing context test
file):

1. **Package-root auto-detection.** Given a fixture with structure
   `fixtures/monorepo/{package.json, packages/app/{package.json,
   src/billing.ts}}`, calling `context({ file:
   "packages/app/src/billing.ts" })` from the monorepo root produces
   the same `findings` array as calling it with `root:
   "packages/app"`.
2. **Explicit `--root` still wins.** Given the same fixture, passing
   `--root .` from the monorepo root keeps the monorepo as the scan
   scope (no package-root climbing).
3. **Target outside any package.json.** Behaviour falls back to
   `process.cwd()`. No throw.
4. **examples/messy-ts-app end-to-end.** A high-level CLI test (or a
   `pnpm scan:example`-style script) that runs `crimes context
   examples/messy-ts-app/src/routes/settings/billing.tsx` from the
   monorepo root and asserts that at least one `route_metadata_drift`
   or structural finding is present. This is the regression guard.
5. **Symlink resilience.** A target whose absolute path differs from
   its `realpath` (the same hazard
   [`packages/core/src/scan.ts`](./packages/core/src/scan.ts:147)
   already documents). Use `safeRealpath` for the package-root walk.

### Non-goals

- Full workspace traversal (scanning every package in the monorepo from
  the monorepo root). Stay focused on the target file's package; whole-
  monorepo scans remain the job of `crimes scan .`.
- Custom `--package-root` flag. The auto-detection plus existing
  `--root` is enough.

---

## 4. Domain / neighbourhood awareness (must-ship)

### What this delivers

A new deterministic step inside `crimes context <file>` that lists the
files an agent should read before editing the target — beyond just the
findings on the file itself. The output is the "what else lives in this
neighbourhood?" answer that today's report misses.

Example: targeting `api/admin/users/route.ts` should surface
`api/admin/teams/route.ts`, `api/admin/layout.tsx`,
`lib/admin-auth.ts`, and any `admin-*.ts` siblings.

### Heuristics (deterministic, no LLM)

Each heuristic is independent. The final list merges and deduplicates.
Every entry carries a short `reason` string so an agent can decide
whether to trust the suggestion.

1. **Same-directory siblings.** Every file in the target's directory.
   Reason: `"same directory"`. Capped at 8 to avoid swamping deeper
   reasons.
2. **Parent-directory siblings.** Every file in the target's
   parent directory (one level up) that is _not_ a sibling. Reason:
   `"parent directory"`. Capped at 4. Skip for shallow paths
   (≤2 segments).
3. **Shared path tokens.** Use existing `tokenisePath()` from
   [`packages/core/src/ia/tokenise.ts`](./packages/core/src/ia/tokenise.ts).
   Compute the target's token set, intersect against every other source
   file's token set, rank by intersection size (≥2 shared tokens
   excluding `index`/`page`). Reason: `"shares tokens: admin, users"`.
4. **Domain prefix / suffix match.** Pick the target's dominant
   non-stop-word token (first token of its filename, e.g. `admin` for
   `admin-auth.ts`, or first non-prefix segment for `api/admin/...`).
   List every source file whose basename starts with `<domain>-`, ends
   with `-<domain>.ts`, or sits under `<domain>/`. Reason: `"shares
   domain prefix: admin"`. Cap at 8.
5. **Importers and imported-by.** Walk the import statements of the
   target file (text-grep is sufficient — same approach as
   `importsTarget` in
   [`packages/core/src/context.ts`](./packages/core/src/context.ts:256))
   and the imports of every sibling. Reason: `"imports this file"` /
   `"imported by this file"`. Cap at 10. Best to wire this through a
   small helper that returns relative-path imports per file; full
   resolution can wait.
6. **IA `related_files` from any IA finding on the target.** Already
   computed by 0.3.0. Re-use directly. Reason: `"IA: <type>"` (e.g.
   `"IA: route_metadata_drift"`).
7. **Convention-driven helper directories.** For a target under
   `api/<domain>/...`, also surface
   `lib/<domain>-*.ts`, `lib/<domain>/*.ts`, and
   `src/<domain>/*.ts` (and same for `app/<domain>`, `pages/<domain>`).
   Reason: `"<domain> helper file"`. This is the explicit
   `lib/admin-auth.ts` for `api/admin/**` case the feedback called out.

### Output shape

Add an additive optional field to `ContextReport`:

```ts
interface RelatedFile {
  path: string;          // repo-package-relative POSIX
  reasons: string[];     // one or more of the heuristics above
  weight: number;        // 0-1, sum of normalised reason weights, rounded to 2dp
}

interface ContextReport {
  // ... existing fields unchanged
  related_files?: RelatedFile[];      // NEW — neighbourhood pass
  related_files_reason?: string;      // see §6.4 — explains absence
}
```

Naming note: 0.3.0 already uses `Finding.related_files` on IA findings.
The top-level `ContextReport.related_files` field is parallel but
broader (covers the whole file, not just one finding). The semantic
overlap is intentional and not ambiguous — `Finding.related_files`
remains per-finding evidence; `ContextReport.related_files` is the
union neighbourhood. Document both in `docs/json-schema.md`.

**Cap the list at 12 entries** by default; sort by weight descending,
then by `path` ascending. Above-cap entries collapse to a single
`"+N more (see --all)"` evidence line in the human report. JSON is
unchanged by `--all` (the field always carries the full list — agents
can re-sort).

### Weighting

A simple additive scheme keeps the heuristic predictable:

| Reason | Weight |
| ------ | ------ |
| `same directory` | 0.20 |
| `parent directory` | 0.10 |
| `shares tokens: …` | 0.10 per shared token, cap 0.40 |
| `shares domain prefix: …` | 0.30 |
| `imports this file` / `imported by this file` | 0.20 each |
| `IA: <type>` | 0.40 |
| `<domain> helper file` | 0.30 |

Reasons compose. Weight is just a sort key, capped at 1.0; treat it as
ordinal, not absolute. Document it accordingly (same contract as
`scores.*`).

### Reporter changes

The human reporter ([`packages/reporter/src/human.ts`](./packages/reporter/src/human.ts))
gains a `Neighbourhood` section under `Findings` and above `Agent
guidance`:

```
Neighbourhood
  · api/admin/teams/route.ts        — same directory; shares tokens: admin
  · api/admin/layout.tsx             — parent directory
  · lib/admin-auth.ts                — admin helper file; imported by this file
  · … and 4 more (see --all)
```

The JSON reporter just serialises the field.

### Tests

Add to a new `packages/core/src/related-files.test.ts`:

1. Same-directory case: target `src/foo.ts` returns its directory siblings.
2. Domain prefix case: target `api/admin/users/route.ts` returns
   `lib/admin-auth.ts` with `"admin helper file"`.
3. Importer / imported-by case: a test file that imports the target
   appears with reason `"imports this file"`; a file imported by the
   target appears with `"imported by this file"`.
4. Token overlap case: `team-billing.ts` returns `team-roles.ts`
   (shares `team`).
5. IA passthrough: when an IA finding on the target carries
   `related_files`, those files appear in the top-level
   `related_files` with reason `"IA: route_metadata_drift"`.
6. Cap behaviour: a synthetic fixture with 50 siblings yields exactly
   12 entries (default), with the highest-weight entries kept.
7. Empty case: a single-file repo with no imports and no IA findings
   yields `related_files: []` AND `related_files_reason: "no
   neighbourhood signal found"`.

### Performance budget

The neighbourhood pass adds an O(F) iteration with O(F) token-set
comparisons. The token sets are already computed by the IA index for
every source file (`IaFileSignals.tokens`). Re-use them; do not
re-tokenise.

For very large repos, gate the pass behind a 200ms soft budget per
target (per the PRD's _under 60s for a medium TS repo_ goal). If the
budget is exceeded, return the partial list and set
`related_files_reason: "neighbourhood pass truncated due to repo
size"`.

---

## 5. Shape-aware `large_function` (must-ship)

### Symptom

[`packages/core/src/detectors/large-function.ts`](./packages/core/src/detectors/large-function.ts)
uses one threshold (60 lines) for every function. Real repos:

- React page components legitimately span 150–250 lines and are not a
  smell.
- Next.js App Router route handlers are typically 60–100 lines and
  belong together.
- Test `describe()` / `it()` callbacks routinely cross 60 lines and are
  emphatically not a structural problem.

### Plan: classify shape, then apply per-shape thresholds

Add a `shape` classification to every function that
[`packages/language-js/src/parse.ts`](./packages/language-js/src/parse.ts)
returns. Extend `ParsedFunction`:

```ts
export type FunctionShape =
  | "domain"
  | "test_callback"
  | "react_component"
  | "page_export"
  | "route_handler"
  | "unknown";

export interface ParsedFunction {
  // existing
  name: string | undefined;
  kind: FunctionKind;
  startLine: number;
  endLine: number;
  // new
  shape: FunctionShape;
  /** Path-derived hints used to classify shape, captured for evidence. */
  shapeEvidence?: string[];
}
```

Classification rules, evaluated in this order (first match wins):

1. **`test_callback`** — the function is an argument to a call whose
   callee identifier is in `{describe, it, test, suite, beforeAll,
   beforeEach, afterAll, afterEach, context, fdescribe, fit, xdescribe,
   xit}`. Pure AST check — already trivial with `node.parent`.
2. **`route_handler`** — the function is a named export with name in
   `{GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD}` and lives under a
   route directory (`src/app/**`, `app/**`, `src/pages/api/**`,
   `pages/api/**`). Path information is already available to the
   detector via `ctx.file`.
3. **`page_export`** — the function is the default export of a file
   under `src/pages/**`, `pages/**`, `src/app/**`, or `app/**` (and
   the basename is the App Router `page.tsx` / `layout.tsx` /
   `template.tsx` / `default.tsx`, or the Pages Router file name
   itself).
4. **`react_component`** — name is PascalCase AND the body returns JSX
   (cheap AST check: any `JsxElement` / `JsxSelfClosingElement` /
   `JsxFragment` descendant). Lives outside route directories.
5. **`domain`** — anything else with a name.
6. **`unknown`** — anonymous arrow / function-expression that didn't
   match any of the above. Keep at the current threshold to avoid
   false negatives on real god-functions hiding inside callbacks.

Thresholds (lines):

| Shape | Threshold | Severity at threshold | Severity at 2× threshold |
| ----- | --------- | ---------------------- | ------------------------- |
| `domain` | 60 | medium | high |
| `route_handler` | 100 | medium | high |
| `react_component` | 200 | medium | high |
| `page_export` | 200 | medium | high |
| `test_callback` | 200 | low | medium |
| `unknown` | 80 | medium | high |

Test callbacks fire at much higher thresholds AND at lower severities —
they still surface as a signal when they get genuinely silly (a
500-line `describe()` block is a real problem) but they no longer
dominate scans.

### Evidence wording

```
generateInvoice is 204 lines long (domain function threshold 60).
HomePage is 248 lines long (React component threshold 200).
GET is 142 lines long (route handler threshold 100).
describe(...) callback at line 12 is 240 lines long (test threshold 200).
```

Include `shape` and (where applicable) the surrounding callee name in
`evidence`. Carry shape into `Finding.scores.agent_risk` weighting —
test callbacks contribute less agent risk than route handlers.

### Tests

Add to `packages/core/src/detectors/large-function.test.ts`:

1. **Test callback at 70 lines does not fire.** Snapshot a
   `describe()`-wrapped function and assert no `large_function`
   finding.
2. **Test callback at 240 lines fires at `low` severity** with shape
   evidence.
3. **React component (PascalCase + JSX) at 180 lines does not fire**;
   same component at 220 lines fires at `medium`.
4. **Next.js App Router `GET` handler under `src/app/api/...` at 80
   lines does not fire**; at 110 lines it fires at `medium`.
5. **Domain function at 75 lines still fires** (regression guard for
   the current behaviour).
6. **Page export at 220 lines fires at `medium`; at 401 lines fires
   at `high`.**
7. **examples/messy-ts-app retains its intended God Function finding.**
   `generateInvoice` is 204 lines; with the new domain-function
   threshold of 60, it should still escalate to `high` (3.4× threshold).
   This is the existence proof that the fixture stays demonstrative.

### Migration concern

Changing thresholds will reduce the number of findings on already-
adopted repos. That is the intended outcome, but it materially affects
baseline files. The baseline format is identity-only
(`<type>::<file>::<symbol>`), so an existing baseline entry for a
React component at 80 lines will simply no longer match — the file
matches the baseline (still present) but no longer produces a
matching new finding, so it counts as `fixed`. That is correct
behaviour: the baseline says "ignore this debt", and the debt is no
longer a finding. **Document it in the changelog** so adopters
understand why their baseline check now shows fixes it didn't expect.

---

## 5.6 `docs_code_drift` GitHub-relative link allowlist (must-ship)

In
[`packages/core/src/detectors/docs-code-drift.ts`](./packages/core/src/detectors/docs-code-drift.ts),
and the link extraction in
[`packages/core/src/ia/extract.ts`](./packages/core/src/ia/extract.ts:280)
+ resolution in
[`packages/core/src/ia/build.ts`](./packages/core/src/ia/build.ts:171),
links are classified as `isLocal` if they don't start with `http://`,
`https://`, `mailto:`, `tel:`, `ftp://`, or `#`. That treats
`../../issues` as a local filesystem path, which it isn't — it is a
GitHub-relative URL that GitHub re-writes server-side.

### Fix

Add a small allowlist of GitHub-relative patterns that should be
treated as **non-local** (and therefore never flagged):

```
^\.\.\/\.\.\/(issues|pulls?|discussions|wiki|actions|releases|projects|security|sponsors|compare|blob|tree|commit|commits)(?:[/?#].*)?$
```

Place the check in `isLocalLink()` in
[`packages/core/src/ia/extract.ts`](./packages/core/src/ia/extract.ts:293).
Document the allowlist in `docs/finding-types/ia.md` under
`docs_code_drift`'s false-positive section.

### Tests

Add to `packages/core/src/detectors/docs-code-drift.test.ts`:

1. README with `[Issues](../../issues)` → no finding.
2. README with `[Open issue](../../issues/new?title=foo)` → no finding.
3. README with `[PR 42](../../pull/42)` → no finding.
4. README with `[Real broken link](./missing-file.md)` → finding stays.
5. README with `[GitHub blob](../../blob/main/PRD.md)` → no finding
   (because GitHub URL, even though the file does exist locally — we
   intentionally do not "rescue" these).

---

## 6. Existing JSON contract changes

All additions are optional / additive — no breaking changes, no
`schema_version` bump.

### 6.1 `ContextReport.agent_guidance` placement

The field already exists. Move it earlier in the serialised JSON
order:

```jsonc
{
  "schema_version": "0.1.0",
  "report_type": "context",
  "repo": { ... },
  "file": "...",
  "risk": { ... },
  "agent_guidance": [...],          // ← moved up
  "related_files": [...],           // NEW
  "related_files_reason": "...",    // NEW, optional
  "findings": [ ... ],
  "likely_tests": [...],
  "likely_tests_reason": "..."      // NEW, optional
}
```

Object-key order is not part of the schema contract (consumers should
read by key, not by position), but the test fixtures and docs do show
a canonical order. Move it there too — agents copy-paste those.

### 6.2 `ContextReport.likely_tests` discovery extension

In
[`packages/core/src/context.ts`](./packages/core/src/context.ts:76):

```ts
const TEST_EXT = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
```

Misses Go-style `_test.ts` / `_test.js` / `_spec.ts`. Replace with:

```ts
const TEST_EXT =
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|_(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
```

Then ensure the basename-stripping step also handles `_test` /
`_spec` suffixes:

```ts
const TEST_INFIX_OR_SUFFIX = /(?:\.(?:test|spec)|_(?:test|spec))$/;
const noTest = b
  .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "")
  .replace(TEST_INFIX_OR_SUFFIX, "");
```

Test: a fixture file `test/index_test.ts` is returned as a likely test
for `src/index.ts`.

### 6.3 `ScanReport.changed_files` (new optional field)

When the CLI runs `crimes scan --changed [--base ...]`, today the
result is just `findings` filtered to changed files. Add a top-level:

```ts
interface ScanReport {
  // ... existing
  changed_files?: string[];   // repo-relative POSIX, sorted, deduped
}
```

Populated only when `--changed` was set. Lists every file the
`getChangedFiles` resolver returned, even if no findings were
attached. Absent on a plain `crimes scan`.

Wire it through
[`packages/core/src/scan.ts`](./packages/core/src/scan.ts:140) —
`restrictToChanged` already has the list; just plumb it back.

### 6.4 Empty-field reasons

Add three optional reason fields to `ContextReport`:

```ts
interface ContextReport {
  // ... existing
  related_files_reason?: string;    // present when related_files is empty
  likely_tests_reason?: string;     // present when likely_tests is empty
  agent_guidance_reason?: string;   // present when agent_guidance is empty
}
```

Standard wordings:

- `related_files_reason: "no neighbourhood signal found"` (default empty)
- `related_files_reason: "neighbourhood pass truncated due to repo size"`
- `likely_tests_reason: "no test files matched naming conventions"`
- `likely_tests_reason: "skipped — not a source file"`
- `agent_guidance_reason: "no findings on this file"` (when findings is empty)

The reason is only set when the corresponding array is empty.

### 6.5 `HotspotsReport.history_limited`

Add to [`packages/core/src/hotspots.ts`](./packages/core/src/hotspots.ts):

```ts
interface HotspotsReport {
  // ... existing
  history_limited?: boolean;       // true when the repo is a shallow clone
  history_limited_reason?: string;
}
```

Detect via `git rev-parse --is-shallow-repository`. When `true`, set
`history_limited: true` and the reason e.g. `"repository is a shallow
clone; older commits are unavailable"`. Human reporter shows the
shallow notice under the existing `(not a git repo …)` message.

### Stability impact

All four additions are optional. Existing consumers parsing
`ContextReport` / `ScanReport` / `HotspotsReport` keep working
without modification. Document the additions in
[`docs/json-schema.md`](./docs/json-schema.md) under each report.

---

## 7. Pre/post scan baseline (could-ship / defer)

### Recommendation

**Defer to 0.5.0** as a CLI flag; ship the core capability
opportunistically.

### Why this is interesting

An agent running a pre/post-edit loop today has two options for
diffing its own work:

1. **`crimes scan --changed [--base <ref>]`** — git-aware. Works
   beautifully when the change is already committed, less so during
   a live edit session.
2. **`crimes diff <base...head>`** — requires both refs to be
   committed. Working-tree-safe (via `git archive`) but not useful
   for "compare to what I scanned 30 seconds ago".

The proposed `crimes scan --changed --baseline <pre-scan.json>` fills
the gap: snapshot before, scan after, fingerprint-diff against the
snapshot.

### Design

`scan.ts` already has `applyScanFailOn`. Add a parallel
`applyScanBaseline(report, baselineReport)` that:

1. Loads a `ScanReport` (or `Baseline`) from `<path>` and validates its
   `schema_version` matches.
2. Builds fingerprint sets for both — re-using the existing
   `fingerprintFinding` helper.
3. Annotates the new report with `baseline_summary: { new, fixed,
   unchanged }` and `new_findings_against_baseline: Finding[]`.

This is a few dozen lines of new code that reuses everything
existing.

### CLI surface (deferred)

Two shapes were considered:

| Shape | Pros | Cons |
| ----- | ---- | ---- |
| `crimes scan --changed --baseline <path>` | Fits the existing changed-files gate. | Confuses with `.crimes/baseline.json` semantics (forward-only debt vs ad-hoc snapshot). |
| `crimes diff-scan <pre.json>` | Separate verb, clean semantics. | New command surface; more docs to write. |
| `crimes diff --since-scan <path>` | Reuses `diff` shape. | Couples to the `<base>...<head>` mental model that doesn't fit. |

**Recommendation:** if it ships in 0.4.0, prefer
`crimes scan --baseline <path>` (without requiring `--changed`) so the
flow is "scan everything pre-edit → scan everything post-edit → diff
fingerprints". This is the simplest mental model and aligns with the
agent loop.

But: it duplicates 80% of what `crimes diff` already does. The
distinguishing case (live edits before commits) is real but narrow.
The user's existing `pre-edit-scan.json` workflow already works by
piping `--format json` into a file and using `jq`. **Defer the CLI
plumbing to 0.5.0.** Spend 0.4.0 capacity on items 1-6 above where
the leverage is higher.

What can ship in 0.4.0: the `applyScanBaseline()` helper in `@crimes/core`
as an exported function, undocumented at the CLI level. That makes it
available to anyone who scripts around the JSON and lets the CLI flag
land later without re-architecture.

---

## 8. Documentation plan

The honesty pass is small but high-leverage. Agents are reading these
files; they should not have to triangulate "is this shipped?" across
three documents.

### README

- Add an explicit "What's deferred" callout near the existing detector
  tables. Today the deferred list is in `ROADMAP_STATUS.md`. Mirror it
  in the README with one-line entries linking to the status doc.
- Add a "When findings are advisory vs blocking" callout to the IA
  section. The wording is in `docs/finding-types/ia.md` — copy it up.

### docs/agent-usage.md

- Add a section "Reading empty fields" that explains
  `likely_tests_reason`, `agent_guidance_reason`,
  `related_files_reason`. Three short paragraphs.
- Add a section "Working in monorepos" that documents the auto package
  root detection from §3 and the `--root` override. Include the
  "from the package root vs from the monorepo root" example.
- Update the "How to use the fields" lists in the `ContextReport`
  section to mention `related_files` and to recommend reading it
  before `findings`.

### docs/json-schema.md

- Document every additive field in §6 above. Each gets a paragraph
  explaining when it's present and how to read it.

### docs/finding-types/ia.md

- Update `docs_code_drift`'s "False positives" section with the
  GitHub-relative allowlist.
- Note the new `RelatedFile` field on `ContextReport` and the
  relationship to the existing `Finding.related_files`.

### Website

Out of scope for 0.4.0 per the user's instruction. Hold the website
update for the release candidate prompt.

---

## 9. Implementation prompt sequence

Five prompts, sized for one focused PR each. Each prompt should land
on `main` independently, with passing build / typecheck / test before
the next starts.

### Prompt A — Context root detection + `likely_tests` extension

Scope:

- Add `findNearestPackageRoot()` helper.
- Refactor `context()` in `packages/core/src/context.ts` to resolve
  the scan root from the target file when `--root` is absent.
- Update the CLI command in `packages/cli/src/commands/context.ts` to
  stop pre-resolving against `process.cwd()`.
- Extend `TEST_EXT` and basename stripping for `_test` / `_spec`
  suffixes.
- Add tests for both behaviours.
- Add a `--root` regression test.

Done when: `crimes context examples/messy-ts-app/src/routes/settings/billing.tsx`
produces the same findings from the monorepo root as from inside
`examples/messy-ts-app`, and `test/index_test.ts` shows up in
`likely_tests` for `test/index.ts`.

### Prompt B — Neighbourhood related-files + top-level guidance ordering + empty-field reasons

Scope:

- Add `RelatedFile` type and `ContextReport.related_files` field.
- Implement the 7 heuristics in §4 in a new module
  `packages/core/src/related-files.ts`.
- Wire into `context()` after IA index build, before findings.
- Surface `related_files_reason`, `likely_tests_reason`,
  `agent_guidance_reason` when arrays are empty.
- Reorder JSON serialisation so `agent_guidance` precedes `findings`.
- Update the human reporter to render a `Neighbourhood` block.
- Add tests for each heuristic + the cap behaviour.

Done when: the bundled fixture's
`docs/fixtures/messy-ts-app.json` regenerates with a populated
`related_files` array and `agent_guidance` appears above `findings`.

### Prompt C — Shape-aware `large_function` + `docs_code_drift` allowlist

Scope:

- Extend `ParsedFunction` with `shape` and `shapeEvidence` in
  `packages/language-js/src/parse.ts`.
- Implement the 6 classification rules.
- Rewrite `largeFunctionDetector.run` to look up per-shape thresholds.
- Update evidence wording to include the shape.
- Add the GitHub-relative allowlist to `isLocalLink()`.
- Tests in `packages/core/src/detectors/large-function.test.ts` and
  `docs-code-drift.test.ts` per §5 and §5.6.
- Confirm `examples/messy-ts-app` still demonstrates the God Function
  finding.

Done when: a fixture `describe()` block of 70 lines no longer flags,
a fixture React component of 180 lines no longer flags, a 110-line
App Router `GET` flags, and the README's `../../issues` link no
longer trips `docs_code_drift`.

### Prompt D — `scan --changed` `changed_files` + hotspots `history_limited`

Scope:

- Add `changed_files` to `ScanReport` when `--changed` is set; wire
  through `scan.ts`.
- Detect shallow clones via `git rev-parse --is-shallow-repository`
  in `packages/core/src/git/`.
- Add `history_limited` and `history_limited_reason` to
  `HotspotsReport`.
- Update human reporters for both.
- Tests covering the new optional fields.

Done when: `crimes scan --changed --format json` lists every changed
file even when none produced findings, and `crimes hotspots` on a
shallow clone reports `history_limited: true`.

### Prompt E — Docs, schema reference, fixtures, release candidate

Scope:

- Update `docs/agent-usage.md`, `docs/json-schema.md`, `README.md`,
  and `docs/finding-types/ia.md` per §8.
- Regenerate `docs/fixtures/messy-ts-app.json` from a real scan.
- Update `ROADMAP_STATUS.md` with the 0.4.0 status table.
- Bump `packages/cli/package.json` to `0.4.0`.
- Run the full publish-smoke test.
- Prepare release notes for the GitHub Release.

Done when: pnpm build / typecheck / test pass, the smoke test passes,
and a draft release-notes file is committed.

---

## 10. Risks

### Breaking JSON consumers

All schema additions are optional and additive — no field is removed,
no required field changes type. The biggest concrete risk is that
some downstream agent prompt instructs Claude / Codex to expect a
specific JSON key order (`findings` first, etc.). Moving
`agent_guidance` ahead of `findings` could surprise such a prompt.
Mitigation: the README and `docs/agent-usage.md` examples carry the
canonical order. Document the change in the release notes; agents
that read by key name (the recommended pattern, per
[`docs/json-schema.md`](./docs/json-schema.md#stability-guarantees))
are unaffected.

### Monorepo root ambiguity

The package-root walk picks the _nearest_ `package.json`. In a deeply
nested monorepo with workspace-of-workspaces shapes, that could land
on a sub-package the user did not intend. Two mitigations:

- `--root` always wins. Explicit overrides are honoured.
- The CLI should print the resolved root to stderr (one short line)
  when it differs from `process.cwd()`. This keeps the auto-detection
  inspectable without requiring an explicit flag every time. Goes in
  the CLI command, not in `context()`.

### Neighbourhood heuristics becoming noisy

Token-based and prefix-based heuristics overfit to whatever happens to
share names. Mitigations:

- The cap (12 entries by default) is a hard ceiling.
- Each entry carries a `reasons[]` array so an agent can dismiss
  weak matches.
- The fixture run on `examples/messy-ts-app` is the canary: any
  regression there means the heuristics are over-firing.

### Large_function thresholds hiding real risk

Raising thresholds for React / page / handler shapes will inevitably
miss some real god-functions that hide behind those shapes (a 199-line
React component with five overlapping concerns is still a smell). Two
mitigations:

- `unknown` shape stays at 80 lines — the catch-all fires earlier.
- The forthcoming `scores.churn` and `scores.test_gap` work (deferred
  to 0.5.0+) is the right long-term answer: not "is this big?" but "is
  this big AND changing AND untested?"

### Overfitting to the fixture / this repo

The bundled `examples/messy-ts-app` is the easiest regression guard,
which makes it tempting to tune everything against it. Mitigation:

- Add at least one synthetic fixture per detector in tests (not just
  the messy-ts-app integration test).
- Run a manual `crimes scan packages docs` on the crimes monorepo
  itself before the release and document the finding counts in the
  release notes. A delta in the first-party self-scan is the second
  canary.

### Performance

The neighbourhood pass adds one O(F) traversal per `crimes context`
call. On a large monorepo F could exceed 10k. Mitigations:

- Re-use the IA index's pre-tokenised file signals; never re-tokenise.
- The 200ms soft budget per target keeps tail latency bounded.
- Document that the heaviest cost is the IA index build itself, which
  already runs and is the same for every command.

---

## 11. Success criteria

`crimes@0.4.0` ships when all of the following are true:

1. **Monorepo context works.** `crimes context
   examples/messy-ts-app/src/routes/settings/billing.tsx` produces the
   same findings from the monorepo root as from inside
   `examples/messy-ts-app`. `--root` still overrides.
2. **Agents get neighbourhood files before editing.** `crimes context
   <any-route-file>` returns a non-empty `related_files` list, each
   entry carrying a reason. The fixture exercises at least four of the
   seven heuristics.
3. **Test and React noise drops materially.** On the bundled fixture
   and on the crimes monorepo first-party self-scan
   (`crimes scan packages docs`), `large_function` findings against
   test-callback / page-export / react-component / route-handler
   shapes drop to zero or to `low`-severity advisory. The intended
   `generateInvoice` God Function finding still fires at `high`.
4. **`likely_tests` discovers `_test.ts` / `_spec.ts`.** A fixture
   asserts this.
5. **`docs_code_drift` no longer flags GitHub-relative links.** The
   crimes monorepo's own README scans clean on the
   `docs_code_drift` axis.
6. **`scan --changed` returns `changed_files`.** A fixture asserts
   the field is present and includes files with zero findings.
7. **`hotspots` annotates shallow clones.** A fixture in a shallow-
   cloned scratch repo asserts `history_limited: true`.
8. **No more detectors added.** Zero new entries in the detector
   table.
9. **Build / typecheck / test all pass.** `pnpm build && pnpm
   typecheck && pnpm test` is green.
10. **Fixture / examples still demonstrate IA crimes.** The IA fixture
    output (`docs/fixtures/messy-ts-app.json`) regenerates with the
    same five IA finding types still firing.
11. **Schema additions documented.** `docs/json-schema.md` carries
    every new optional field with a short rationale.
12. **No `schema_version` bump.** All changes are additive.

If any of 1, 2, 3, 5 fail, the release is not ready. 4, 6, 7 are
must-ship but smaller surface; 8-12 are gates on the release process.
