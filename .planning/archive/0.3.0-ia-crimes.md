# `crimes@0.3.0` — Information Architecture Crimes

Implementation plan for the `crimes@0.3.0` release. This is a planning
document, not a build artefact: nothing here ships until a follow-up branch
implements it. The authoritative spec stays `PRD.md`; the live milestone
tracker stays `ROADMAP_STATUS.md`; this file is the IA-track plan handed to
the implementation agents.

- **Repo state at planning time:** `crimes@0.2.0` release candidate on
  `main`. `crimes scan`, `scan --changed [--fail-on]`, `context`,
  `hotspots`, `diff`, `baseline save/check`, and `verdict` all ship.
  Detectors: `large_function`, `large_file`, `todo_density`, `direct_date`.
  Finding schema is at `schema_version: "0.1.0"`.
- **Constraint:** do not change shipped CLI behaviour, do not bump the
  package version, do not edit the website yet. This plan only touches new
  source under `packages/core/src/ia/` and the new detectors that consume
  it, plus a fixture and docs.

---

## 1. Product framing

**Positioning.** _Deterministic evidence that your repo tells multiple
stories about the same product concept._

IA crimes are different from structural crimes (`God Function`, `God File`)
and different from change-set crimes (`crimes diff`, `crimes verdict`).
Structural crimes are local: one function is too big, one file is too long.
IA crimes are **cross-file source-of-truth ambiguity** — the repo gives
humans and coding agents conflicting answers to questions like:

- _What is this concept called?_ (`team` vs `workspace` vs `organisation`
  vs `account` for the same noun)
- _Where does this destination live?_ (`/settings/billing` labelled
  "Plans", titled "Subscription", implemented by `PricingPage.tsx`)
- _Which file owns this nav entry?_ (sidebar array in one file, route
  registry in another, breadcrumbs in a third — and they disagree)
- _Who is allowed to do this?_ (nav guarded by `admin`, route guarded by
  `owner`, code checks `organization.manage`, docs say "any team member")
- _Where is the source of truth?_ (two pages, two components, two
  documents that all claim to be canonical)

These drift slowly. Each individual file is fine. The crime is in the
**disagreement between files**, which is why linters do not catch it and
why coding agents repeatedly trip over it — an agent reading one file in
isolation has no way to know that three other files describe the same
concept differently.

### Why IA drift hurts

- **Meetings.** "Which one is the real billing page?" is a meeting,
  not a code review. The repo should answer that question without a
  meeting.
- **Duplicated decisions.** When two files describe the same destination
  with different labels, the next change either picks a side (and the
  drift grows) or extends both (and the drift becomes load-bearing).
- **Inconsistent UI.** Users see one label in the nav, a different label
  in the header, a third in the URL. Customer-facing.
- **Customer confusion.** Support docs say "Team plan"; the UI says
  "Workspace subscription"; the billing receipt says "Pro tier".
- **Agent mistakes.** Coding agents pick the wrong vocabulary and the
  wrong file. Rename `team` to `workspace` in one place; the other six
  places now silently disagree.

### Why findings must be evidence-first and "appears ambiguous"

IA crimes are inherently semantic — the heuristic _guesses_ that two
identifiers refer to the same concept. That guess will sometimes be wrong:
`organisation` and `account` may be two genuinely different things in
this product. The detector must therefore say:

> "These six files reference `team`, `workspace`, and `organisation` in
> what looks like overlapping ways. **This appears ambiguous.** Read each
> file and decide whether it is intentional before extending it."

never:

> "`team` and `workspace` are the same concept. Pick one."

The repo, not the detector, is the source of truth about whether the
ambiguity is real or intentional. The detector earns trust by:

1. Refusing to fire without concrete evidence (file paths, token strings,
   route paths, label literals).
2. Carrying that evidence verbatim in `Finding.evidence` so a human can
   verify it in 30 seconds.
3. Calling its own confidence honestly (low when the heuristic is shaky;
   high only when the evidence is hard to dispute).
4. Phrasing every summary as "appears" / "may" / "looks like", not
   "is" / "must" / "should".

The product wedge is unchanged: deterministic, local, JSON-first. No
LLM. No cloud calls. No semantic claims the detector cannot back with
file evidence.

---

## 2. `0.3.0` release goal

> **`crimes@0.3.0` helps humans and coding agents identify source-of-truth
> ambiguity before editing product flows.** It ships a deterministic IA
> detector foundation, three first-class IA findings, and the fixture /
> docs / website updates needed to make the new category legible.

By the end of `0.3.0`, all of these must be true:

1. **IA detector foundation shipped.** A reusable `packages/core/src/ia/`
   module extracts signals (path tokens, route strings, nav arrays,
   labels, exported constants, permission-like strings, docs headings)
   from the repo and returns a structured **IA index** that detectors
   consume via the existing `DetectorContext` plus a new context layer.
2. **At least three useful IA detectors ship:** _Missing Agent Context_,
   _Route Metadata Drift_, _Duplicated Navigation Source_. Each carries
   evidence, a charge, agent guidance, and at least one fixture demo.
3. **A fourth conservative detector ships if and only if it stays
   low-noise:** _Concept Alias Drift (conservative)_. If we cannot keep
   its false-positive rate down on the crimes repo itself, defer it.
4. **JSON and human reports work for IA findings** under the existing
   `Finding` shape. Schema additions are minimal and additive — no
   `schema_version` bump.
5. **Docs updated.** `docs/agent-usage.md`, `docs/json-schema.md`, and a
   new `docs/finding-types/ia.md` cover the new detectors. `README.md`
   and `ROADMAP_STATUS.md` updated. Website + `llms.txt` updated in a
   separate, final step.
6. **Fixture demonstrates IA crimes.** `examples/messy-ts-app/` extended
   with realistic IA examples (a nav array, route stubs, a docs file
   that drifts, an AGENTS.md that is missing).
7. **No LLM required.** Every detector runs from AST + regex + path
   parsing. No model calls.
8. **No cloud or API key required.** Everything runs offline.

Out of scope for `0.3.0`: dependency-graph detectors, duplication
detectors (string-literal / function-body), per-finding `scores.churn` /
`scores.test_gap` / `scores.blast_radius`, `crimes ignore`, `crimes
explain`, `crimes init`, and `crimes ask`. These remain on the roadmap
but are not load-bearing for the IA theme.

---

## 3. IA detector taxonomy

Nine candidate detectors. Each is rated honestly — IA crimes are harder
than structural crimes, and overclaiming would erode the product's
"evidence before judgement" principle.

Severity column conventions (PRD §10 + current detector practice):
- **low** — informational; the team probably knows about it.
- **medium** — a coding agent or new contributor is likely to be confused.
- **high** — actively misleading; the next edit will probably propagate the drift.

All IA detectors carry **moderate** `confidence` at best (0.55–0.75
typical, 0.85 only when evidence is overwhelming). They are heuristic by
nature.

---

### 3.1 Concept Alias Drift

**What it detects.** The same domain concept appears under multiple names
across identifiers, paths, exported constants, route strings, and label
literals. Example: `team`, `workspace`, `organization`, `account` all
appear with overlapping semantics across `src/team/`, `src/workspace/`,
`src/auth/`.

**Deterministic MVP heuristic.**
1. Extract a token bag from each source file (camelCase / kebab-case /
   path-segment splitting, lowercased, singularised with a small fixed
   table — see §6).
2. Build a known **alias group catalogue** as a config-shipped seed list
   (NOT user-supplied): `{ team, workspace, organization, organisation,
   account, tenant, company }`, `{ plan, tier, subscription, package }`,
   `{ user, member, seat, account_user }`, `{ delete, remove, archive,
   trash }`, `{ owner, admin, manager, founder }`. Empirically curated;
   ~6 groups in the MVP.
3. For each alias group, count files / routes / labels that contain each
   alias.
4. Fire only when **≥3 of the group's aliases appear in ≥2 distinct
   directories each** within the configured `include` set. This keeps it
   from flagging single-file references.

**Evidence shape.** `evidence: string[]` lists:
- The alias group: `aliases: ["team", "workspace", "organization"]`
- File counts: `"\"team\" in 4 files, \"workspace\" in 3 files, \"organization\" in 2 files"`
- Top file representatives: `"team: src/team/index.ts; workspace: src/workspace/sidebar.ts; ..."`

**Suggested action.** `kind: "consolidate_concept"`, description:
"Pick one vocabulary for this concept and rename the others, or document
why the aliases mean different things." Risk: `medium`.

**Severity.** `medium` for 3-alias overlap, `high` only when ≥4 aliases
overlap in code AND ≥1 in docs.

**Confidence strategy.** Start at `0.6`. Lift to `0.75` only when the
aliases co-occur in the same _semantic context_ — e.g. both appear as
parameter names of functions called from the same caller, or both appear
as route segments at sibling depth.

**False-positive risks.**
- Genuinely different concepts (`account` ≠ `user`).
- i18n keys: `team.title` is a translation namespace, not necessarily a
  domain concept.
- Test fixtures full of mock concepts.
- A "compat" or "migration" module that intentionally bridges old and
  new names.

**Tests needed.**
- Unit test the alias-group catalogue is loaded and lowercased.
- Unit test the token extractor (path → tokens).
- Detector test on a fixture with two clear alias overlaps and a
  no-overlap control.
- Detector test that fires when ≥3 aliases co-occur; does not fire on
  ≥2-alias overlap.
- Snapshot the JSON evidence shape.

**Ship in 0.3.0?** **Conservative MVP — should ship.** Defer if the
crimes-repo-on-crimes-repo run produces >2 false positives.

---

### 3.2 Route Metadata Drift

**What it detects.** A single destination's route path, page title, nav
label, breadcrumb, file path, and component name disagree. Example:
file `src/routes/settings/billing.tsx`, route `/settings/billing`, nav
label `"Plans"`, page `<title>Subscription</title>`, default export
`PricingPage`.

**Deterministic MVP heuristic.**
1. Discover route files via convention: anything matching
   `src/(pages|app|routes|screens)/**/*.{ts,tsx,js,jsx}`. (Configurable;
   sensible defaults match Next.js Pages, Next.js App Router, Remix, and
   React Router file-conventions roughly enough.)
2. For each route file:
   - Compute its **path token** from the file path (`/settings/billing`
     from `src/pages/settings/billing.tsx`).
   - Extract the default-export component name via AST.
   - Extract string literals that look like page titles: `<title>X</title>`,
     `document.title = "X"`, `metadata: { title: "X" }` (Next.js App
     Router), `useTitle("X")`.
   - Extract breadcrumb literals via a small library of conventions —
     `<Breadcrumb label="X" />`, `{ label: "X", ... }` near a
     `Breadcrumb` import.
3. Cross-reference the path token against any nav arrays the IA index
   discovered (see §5).
4. Fire when **≥3 distinct labels** describe the same destination AND
   the labels are not stop-word equivalent (case-insensitive, stripping
   "settings", "page", "screen", "view").

**Evidence shape.**
- `route_path: "/settings/billing"`
- `file: "src/pages/settings/billing.tsx"`
- `evidence: ["component: PricingPage", "<title>: Subscription", "nav label: Plans", "breadcrumb: Billing"]`

**Suggested action.** `kind: "align_route_metadata"`. Risk: `low`
(rename labels and component to match a single canonical phrase).

**Severity.** `medium` (this is the most concrete IA crime and the easiest
to explain in a PR).

**Confidence strategy.** Start at `0.75`. Lift to `0.85` when the route
path itself contains a token absent from every label (e.g. URL says
`billing` but no label says any case of "bill").

**False-positive risks.**
- Translation-keyed labels (`t('billing.title')`) that the static
  extractor cannot resolve. Mitigation: skip findings where ≥2 of the
  labels are translation keys.
- Marketing pages whose copy intentionally differs from the URL.
- Layouts that wrap multiple routes — the title and breadcrumb may
  belong to different destinations.

**Tests needed.**
- Path-to-token extractor.
- Default-export-name extractor.
- Title-literal extractor (test all four patterns).
- Detector test on a fixture with a deliberate billing-page drift.
- Detector test that does NOT fire when labels are stop-word equivalent.

**Ship in 0.3.0?** **Must ship.** Highest value-per-risk in the IA
slate.

---

### 3.3 Duplicated Navigation Source

**What it detects.** The same destination appears in multiple nav-like
source files — a sidebar array, a route registry, a sitemap object, a
breadcrumb config — and the entries disagree on at least one attribute.

**Deterministic MVP heuristic.**
1. Discover "nav-like" arrays/objects: top-level `export const`
   identifiers matching `/nav|sidebar|menu|routes?|registry|sitemap/i`,
   plus literal arrays containing objects with both a `path|href|to|url`
   key AND a `label|title|name` key.
2. For each entry, compute a **destination key**: the path string (or
   the label, if no path exists), normalised.
3. Group by destination key across all discovered nav sources.
4. Fire when a destination key appears in **≥2 distinct files** AND the
   non-key attributes (label, icon, permission flag) differ.

**Evidence shape.**
- `route: "/settings/billing"`
- `sources: ["src/nav/sidebar.ts:42", "src/routes/registry.ts:108", "src/marketing/sitemap.ts:14"]`
- `evidence: ["sidebar.ts label: Plans", "registry.ts label: Billing", "sitemap.ts label: Subscription"]`

**Suggested action.** `kind: "consolidate_nav_source"`. Risk: `medium`
(picking the canonical source is a design call).

**Severity.** `medium`, escalating to `high` when ≥3 nav sources disagree.

**Confidence strategy.** `0.75` baseline; `0.85` when the entries
disagree on `permission` / `role` (the worst case — a destination
accidentally visible to the wrong users).

**False-positive risks.**
- A marketing sitemap _should_ have different labels from the in-app
  sidebar; flagging it is noise. Mitigation: heuristic to detect
  `marketing/` / `public/` / `landing/` paths and downgrade severity.
- Mobile-vs-desktop nav. Same issue — different surfaces should be
  allowed to differ. Mitigation: same path-segment heuristic.
- Test fixtures.

**Tests needed.**
- Nav-array-extractor: handles `as const`, `satisfies`, type-annotated,
  and bare array literals.
- Detector test on a fixture with two nav sources for `/settings/billing`
  with different labels.
- Detector test that does NOT fire when only one nav source mentions a
  destination.
- Detector test that handles the marketing-path downgrade.

**Ship in 0.3.0?** **Must ship.** Pure cross-file finding with strong
evidence.

---

### 3.4 Missing Agent Context

**What it detects.** A repo (or a sub-package) lacks the on-disk
artefacts that coding agents auto-discover, OR has them but they are
stale relative to the current command surface. Specifically:

- No `AGENTS.md` at the repo root.
- `AGENTS.md` exists but does not mention `crimes` (or, more generally,
  does not mention the package's published CLI commands).
- No `.claude/skills/<name>/SKILL.md` for any directory that calls
  itself "the X tool" in `package.json.description`.
- An `AGENTS.md` that references a CLI command the codebase no longer
  exports (e.g. mentions `crimes ask` when the binary doesn't have it).

**Deterministic MVP heuristic.**
1. Look for `AGENTS.md` and `.claude/skills/*/SKILL.md` at the repo root.
2. If neither exists, fire a `low` severity "missing agent context"
   finding.
3. If `AGENTS.md` exists, extract code-fenced command lines and compare
   against the binaries declared by the nearest `package.json` (`bin`
   field). Fire `medium` when a documented command is not exported by
   `bin`.
4. If `package.json.description` contains `"CLI"` or `"command-line"`
   and no `AGENTS.md` exists, fire `medium`.

**Evidence shape.**
- `evidence: ["no AGENTS.md at repo root", "package.json declares bin: { crimes }", "no .claude/skills/*/SKILL.md"]`
- For drift: `evidence: ["AGENTS.md references \"crimes ask\" on line 142", "bin only exposes: crimes", "command not implemented"]`

**Suggested action.** `kind: "add_agent_context"` or
`kind: "update_agent_context"`. Risk: `low`.

**Severity.** `low` (missing) or `medium` (drift between docs and bin).

**Confidence strategy.** `0.9` for missing files (file-system check is
deterministic). `0.7` for drift between `AGENTS.md` and `bin` (the
extractor may misread).

**False-positive risks.**
- Internal-only repos that intentionally do not target agents.
  Mitigation: only fire `missing` at `low` severity, and only when
  `package.json` declares a `bin` field.
- Repos that document commands provided by sibling packages (workspace
  monorepos). Mitigation: walk up to the workspace root to collect all
  exposed bins.

**Tests needed.**
- File-system existence checks (mock the disk via fixture).
- `AGENTS.md` command extractor: code-fenced `crimes <subcommand>` and
  `pnpm <script>`.
- Drift test on a fixture where `AGENTS.md` mentions a fake command.

**Ship in 0.3.0?** **Must ship.** Lowest risk, highest agent-value
ratio — it makes `crimes` useful for the audience it claims to serve.

---

### 3.5 Orphaned Destination

**What it detects.** A route / page / screen file exists but is not
reachable from any nav source, route registry, sitemap, or in-repo link.

**Deterministic MVP heuristic.**
1. Use the route-file discovery from §3.2.
2. Use the nav-source extraction from §3.3.
3. For each route file, compute its path token.
4. Fire when the path token is **not present in any nav source** AND
   no other source file imports the route's default export.

**Evidence shape.**
- `file: "src/pages/settings/legacy-billing.tsx"`
- `route_path: "/settings/legacy-billing"`
- `evidence: ["not referenced by any nav source", "no other file imports LegacyBillingPage", "file size: 412 lines"]`

**Suggested action.** `kind: "verify_destination_canonical"`. Risk:
`low` (it might be deliberate — a deep-link-only page).

**Severity.** `low` (informational — many repos have legitimate orphans).

**Confidence strategy.** `0.6`. Many legitimate cases (deep links,
redirects, A/B-test pages) raise the false-positive risk significantly.

**False-positive risks.**
- Deep-link-only utility pages (e.g. `/verify-email`).
- Dynamic routes resolved at runtime.
- Pages referenced only by external systems.

**Tests needed.**
- Route discovery + nav cross-reference.
- Detector test that fires on a fixture orphan and does NOT fire on a
  nav-reachable page.

**Ship in 0.3.0?** **Could ship.** Easy to implement once §3.2 and §3.3
land, but high false-positive rate. Only ship if the IA-index reuse is
trivial; otherwise defer to `0.3.x` or `0.4.0`.

---

### 3.6 Parallel Destination

**What it detects.** Multiple distinct routes / pages / flows appear to
serve the same user intent. Example: `/billing`, `/settings/billing`,
and `/account/subscription` all rendering a pricing-page-like component;
`InviteUserModal` and `AddTeamMemberDialog` rendering the same form.

**Deterministic MVP heuristic.**
Too hard to do well in `0.3.0`. A serious version needs near-duplicate
JSX detection, near-duplicate route handler detection, or both. Without
those, the heuristic is "two paths share ≥1 token" — which is far too
noisy (`/settings/billing` and `/settings/profile` would match).

**Severity.** N/A.

**Confidence strategy.** N/A.

**False-positive risks.** Severe.

**Tests needed.** N/A in `0.3.0`.

**Ship in 0.3.0?** **Defer.** Track as `0.4.0+` once duplication
detectors land (per roadmap).

---

### 3.7 Permission IA Drift

**What it detects.** Navigation visibility, route guards, docs, and
policy code describe access to the same destination using different
roles or different permission concepts. Example: nav visible to
`admin`, route guarded by `owner`, code checks `organization.manage`,
docs say "team admins".

**Deterministic MVP heuristic.**
Needs all three pieces — nav extraction, route-guard extraction, and a
policy-string extractor — to be working AND to be cross-referenced
against a destination key. We get nav (§3.3); we don't get route guards
or policies in `0.3.0` without scope creep.

**Severity.** N/A.

**Confidence strategy.** N/A.

**False-positive risks.** Too many roles vocabularies; too many policy
shapes.

**Tests needed.** N/A in `0.3.0`.

**Ship in 0.3.0?** **Defer.** Plan for `0.4.0` once route-guard
extraction lands — and only when the destination-key index has matured.

---

### 3.8 Docs-Code Drift

**What it detects.** Markdown headings, anchors, and local links in
`docs/` reference identifiers, file paths, or commands that no longer
exist in the code.

**Deterministic MVP heuristic.**
1. Walk `docs/**/*.md` and the root-level `README.md` / `AGENTS.md` /
   `ROADMAP_STATUS.md`.
2. Extract local relative links (`./foo.md`, `../packages/core/...`,
   `[label](path)`) and verify the targets exist.
3. Extract code-fenced shell commands and check that any leading
   `crimes <subcommand>` references a real subcommand exposed by
   `packages/cli` (parse `commander` command registration via a tiny
   regex over `packages/cli/src/index.ts` and `packages/cli/src/commands/*.ts`).
4. Fire `low` for broken local links, `medium` for documented commands
   that don't exist.

**Evidence shape.**
- For dead link: `evidence: ["docs/agent-usage.md line 87 → ./nope.md (file not found)"]`
- For missing command: `evidence: ["docs/agent-usage.md line 145 references \"crimes ask\"", "packages/cli only registers: scan, context, hotspots, diff, baseline, verdict"]`

**Suggested action.** `kind: "fix_doc_link"` / `kind: "remove_doc_reference"`. Risk: `low`.

**Severity.** `low` (dead links) / `medium` (command drift).

**Confidence strategy.** `0.95` (filesystem) / `0.8` (regex-extracted
command name in a fenced block).

**False-positive risks.**
- Links to files in another worktree (git submodules, generated docs).
- Commands documented as "deferred — do not use" (already the pattern
  in this repo). Mitigation: skip lines whose containing paragraph
  contains `"not implemented"`, `"deferred"`, `"v0.x"`, or `"planned"`
  within 2 lines.

**Tests needed.**
- Markdown link extractor.
- Filesystem existence check.
- Command-name extractor + cli-registration scanner.
- Detector tests covering both the broken-link and missing-command
  cases, plus the "deferred" downgrade.

**Ship in 0.3.0?** **Should ship.** Particularly useful for the
`crimes` repo itself, since `AGENTS.md` and `docs/` already track what
is shipped vs deferred. The detector incidentally guards that
discipline.

---

### 3.9 Action Label Drift

**What it detects.** The same action is labelled differently across UI
copy. Example: `"Delete"`, `"Remove"`, and `"Archive"` for the same
operation; `"User"`, `"Member"`, and `"Seat"` for the same actor.

**Deterministic MVP heuristic.**
Either a small fixed alias catalogue (overlaps with §3.1's concept
catalogue — verbs instead of nouns) OR generic near-duplicate-string
clustering. The first is shallow but tractable; the second is the
duplication-detector roadmap item.

**Severity.** `low` to `medium`.

**Confidence strategy.** Low. Most action-label drift is intentional.
"Delete" and "Archive" really are different actions in many products.

**False-positive risks.** High.

**Tests needed.** Standard alias-catalogue tests, identical to §3.1.

**Ship in 0.3.0?** **Defer unless trivial.** If the §3.1
concept-alias-drift detector turns out to be cheap to specialise into
"verbs near `Button` / `MenuItem` / `<button>`", consider shipping a
narrow version. Otherwise this is a `0.4.0+` item that pairs better
with the duplication track.

---

## 4. Recommended `0.3.0` scope

This is a revision of the user's preferred starting point. The
preferred starting point is mostly correct; two small adjustments
below.

### Must ship

- **IA concept index foundation** (`packages/core/src/ia/`). The shared
  extractor module described in §5/§6.
- **Missing Agent Context** (§3.4). Lowest risk, highest agent-value.
- **Route Metadata Drift** (§3.2). Most concrete IA finding.
- **Duplicated Navigation Source** (§3.3). Pure cross-file evidence.

### Should ship

- **Concept Alias Drift, conservative** (§3.1). Keep the alias catalogue
  small (~6 groups). Ship only if false-positive rate on the crimes
  repo itself is ≤2.
- **Docs-Code Drift** (§3.8). Both the filesystem and the
  cli-registration cross-check are cheap to implement; very useful for
  the `crimes` repo itself; agent guidance value is high.

### Could ship

- **Orphaned Destination** (§3.5). Only ship if §3.2 and §3.3 have
  already done the route + nav discovery work.

### Defer

- **Parallel Destination** (§3.6). Needs near-duplicate JSX detection.
- **Permission IA Drift** (§3.7). Needs route-guard and policy
  extraction.
- **Action Label Drift** (§3.9). Best landed alongside duplication
  detectors.

### Revisions to the preferred starting point

1. **Docs-Code Drift promoted from "if feasible" to a "Should ship"
   target.** Implementation is genuinely cheap (markdown link walker +
   commander-registration regex), it pays off immediately on the
   crimes repo, and it gives the IA-index foundation a fourth concrete
   consumer. The cost is a single docs walker and a regex, both
   already needed elsewhere.
2. **Otherwise the preferred scope is accepted.** The `Must / Should /
   Could / Defer` boundaries map cleanly onto the existing detector
   architecture and the schema-additive constraint.

### Validation against repo architecture

The shipped repo already has clean package boundaries:

- `packages/core/src/detectors/` — one file per detector, each implements
  the `Detector` interface (per-file `run(ctx)`). Today's detectors are
  all **file-local** — they only ever look at `ctx.parsed` for one file.
- `packages/core/src/scan.ts` — walks files, runs detectors, sorts and
  ids the findings.
- `packages/language-js/src/parse.ts` — TS AST extraction.

IA detectors break the file-local assumption: every IA detector needs
to see _other_ files. The architecture supports this cleanly by adding
a **repo-level IA index** (§5) populated _before_ detector runs and
threaded through `DetectorContext`. That keeps the per-file
`Detector.run` interface intact for backwards-compat, and lets IA
detectors opt in to the cross-file index without changing
`largeFunctionDetector` et al.

No schema-version bump is required. All new finding `type` values are
additive under the existing `Finding` shape (the schema explicitly
allows new types to land without a `schema_version` bump — see
`docs/json-schema.md` §"Stability guarantees").

---

## 5. IA concept index architecture

A reusable internal module:

```
packages/core/src/ia/
├── index.ts              # public exports
├── types.ts              # TS interfaces for IaIndex, IaFileEntry, etc.
├── tokens.ts             # path → token bag, casing/plural normalisation
├── routes.ts             # route-file discovery + path token extraction
├── nav.ts                # nav-array / route-registry / sitemap extraction
├── labels.ts             # title / heading / breadcrumb extraction
├── permissions.ts        # role / permission string extraction (heuristic)
├── docs.ts               # markdown walker — headings, links, fenced code
├── agents.ts             # AGENTS.md / SKILL.md discovery
├── aliases.ts            # the seed concept-alias catalogue
├── build.ts              # buildIaIndex(rootDir, files, config): IaIndex
└── *.test.ts             # unit tests next to each module
```

The IA index is built **once per repo scan** before detectors run,
inside `packages/core/src/scan.ts`. It is then attached to
`DetectorContext` via a new optional field so existing detectors that
don't need it continue to compile unchanged.

### Proposed types

```ts
// packages/core/src/ia/types.ts

/**
 * Cross-file IA signal index. Built once per scan, deterministic.
 * Detectors read from this index; they do not mutate it.
 */
export interface IaIndex {
  /** Per-file rolled-up signals, keyed by repo-relative path. */
  files: Record<string, IaFileEntry>;

  /** All discovered nav-like sources, with the entries each defines. */
  navSources: NavSource[];

  /** All discovered route files with their destination metadata. */
  routes: RouteEntry[];

  /** Markdown docs walked under `docs/` and root-level *.md. */
  docs: DocEntry[];

  /** AGENTS.md / SKILL.md presence at the repo root. */
  agentContext: AgentContextInventory;

  /** The seed alias catalogue actually used (for evidence reproducibility). */
  aliasGroups: AliasGroup[];
}

export interface IaFileEntry {
  /** Repo-relative path with forward slashes. */
  file: string;

  /** Tokens derived from the file path, lowercased + singularised. */
  pathTokens: string[];

  /** Component / default-export name, when this is a TS/JS source file. */
  defaultExport?: string;

  /** Detected route paths declared in or implied by this file. */
  routes: string[];

  /** Static string literals that look like UI labels / titles. */
  labels: string[];

  /** Permission-like strings (e.g. "admin", "owner", "billing.manage"). */
  permissions: string[];

  /** Whether this file appears to be a nav source. */
  isNavSource: boolean;
}

export interface NavSource {
  /** Repo-relative file path. */
  file: string;
  /** Line of the array / object literal. */
  line: number;
  /** Variable name (e.g. "sidebarItems"). */
  identifier: string;
  entries: NavEntry[];
}

export interface NavEntry {
  /** Path or href string, normalised. */
  destination?: string;
  label?: string;
  /** Free-form props observed on the entry — used for "differ on attribute" checks. */
  attributes: Record<string, string>;
}

export interface RouteEntry {
  file: string;
  /** Path string e.g. "/settings/billing". */
  routePath: string;
  /** From the file's default-export name. */
  componentName?: string;
  /** Page titles found in the file: <title>, document.title, metadata.title, etc. */
  titles: string[];
  /** Breadcrumb literals found near a Breadcrumb-shaped component. */
  breadcrumbs: string[];
}

export interface DocEntry {
  file: string;
  headings: { level: number; text: string; line: number }[];
  /** Local relative links found in the document. */
  links: { target: string; line: number; isLocal: boolean }[];
  /** Code-fenced shell command lines (no fence wrapping). */
  fencedCommands: { command: string; line: number; nearby: string }[];
}

export interface AgentContextInventory {
  agentsMdPath?: string;
  /** Each detected .claude/skills/<name>/SKILL.md. */
  claudeSkills: string[];
  /** Commands referenced inside AGENTS.md (extracted from fenced blocks). */
  referencedCommands: string[];
  /** Bin names declared by the nearest package.json. */
  declaredBins: string[];
}

export interface AliasGroup {
  /** Stable id, e.g. "team". */
  id: string;
  /** All known aliases for this concept. */
  aliases: string[];
  /** Hint for the suggested-action copy. */
  preferred?: string;
}
```

### The DetectorContext addition

`packages/core/src/detector.ts` extends `DetectorContext` with **one
optional field**:

```ts
export interface DetectorContext {
  // ... existing fields (file, absolutePath, source, parsed, config)
  /** Optional repo-level IA signal index. Present when scan built one. */
  ia?: IaIndex;
}
```

This is a backwards-compatible, optional addition. The existing
detectors don't touch it; the new IA detectors require it. No schema
change.

### How the index is built

`packages/core/src/scan.ts::scan()` orchestrates:

1. Discover files (existing).
2. **New:** Build `IaIndex` by walking the discovered files + docs +
   `AGENTS.md` + `.claude/skills/`. This is a single pre-pass, parsing
   each TS/JS file once (re-uses `parseFile()` results where possible),
   plus a small Markdown walker for docs.
3. Run detectors with `ctx.ia` populated.
4. Sort, id, summarise (existing).

The index is **per-scan**, not memoised across scans (`crimes scan
--changed` builds a smaller index over the changed file set; that is
correct semantically since IA findings should describe the scanned
slice).

---

## 6. Extraction strategy

All extractors are deterministic and live next to the IA index.

### AST extraction (`language-js`)

**Where it lives.** `packages/language-js/src/parse.ts` already exposes
a `ParsedFile`. Extend it with three optional fields:

```ts
export interface ParsedFile {
  // ... existing
  /** Default export identifier name, if a name is recoverable. */
  defaultExport?: string;
  /** All top-level array / object literals that look like nav arrays. */
  navLiterals?: NavLiteral[];
  /** All string literals that look like UI titles / labels (heuristic). */
  uiStringLiterals?: { value: string; line: number; context: string }[];
}
```

`navLiterals` is populated when:
- The literal is an array containing object literals.
- Each object has at least one of `path | href | to | url`.
- Each object has at least one of `label | title | name`.

`uiStringLiterals` is populated for literals that:
- Are the right-hand side of `document.title = ...`, `<title>...</title>`,
  `metadata: { title: ... }`, or `useTitle(...)`.
- Are the `label` / `title` / `text` prop of a JSX element whose tag
  name matches `/^(Breadcrumb|Nav|Sidebar|Menu)/`.

**Rule of thumb.** `language-js` owns **per-file** parsing. It does not
know about the IA index, route-file conventions, or alias groups —
those are repo-level concerns and live in `packages/core/src/ia/`.

### Regex/string extraction (acceptable cases)

Regex is allowed for:
- Markdown walking (it's not worth pulling in a parser for the four
  patterns we need — headings, local links, fenced code, paragraph
  proximity).
- `AGENTS.md` command extraction (fenced shell blocks, simple
  `crimes <subcommand>` matching).
- `package.json` `bin` map reading (it's already JSON; we read it).

Regex is **not** allowed for:
- TS/JS source. Every TS extractor goes through `language-js` and the
  TypeScript compiler API. Regex AST-substitutes have always been
  cursed.

### Markdown extraction (`packages/core/src/ia/docs.ts`)

Use a small custom walker — no dependency. Patterns:
- Headings: `^(#{1,6})\s+(.+)$` per line.
- Local links: `\[([^\]]+)\]\(([^)]+)\)` and reject targets starting
  with `http://`, `https://`, `mailto:`, `#`.
- Fenced code: `^```` block boundaries; capture lines within.
- Paragraph proximity: when an extractor needs to know whether a fenced
  command was deprecated, look ±2 lines outside the fence for the
  trigger phrases (see §3.8).

### Path / token normalisation (`packages/core/src/ia/tokens.ts`)

1. Strip leading `./`, `../`, `src/`, `app/`, `apps/<x>/`, `packages/<x>/src/`.
2. Drop extensions (`.ts`, `.tsx`, `.js`, `.jsx`).
3. Drop conventional terminals (`/index`, `/page`, `/route`, `/view`,
   `/screen`).
4. Split on `/`, `-`, `_`, and camelCase boundaries.
5. Lowercase.
6. Filter stop words (see below).
7. Singularise via a small table:
   ```ts
   const SINGULAR: Record<string, string> = {
     teams: "team",
     workspaces: "workspace",
     organisations: "organisation",
     organizations: "organization",
     accounts: "account",
     users: "user",
     members: "member",
     plans: "plan",
     tiers: "tier",
     subscriptions: "subscription",
     // ...
   };
   ```
   Deliberately **no** generic `-s`/`-es` stripping — too noisy.

### Stop words

```ts
const STOP_WORDS = new Set([
  "page", "view", "screen", "layout", "container",
  "component", "components", "index", "main", "default",
  "src", "app", "apps", "pages", "routes",
  "settings", "config", "configuration",
  "list", "detail", "details", "form", "modal", "dialog",
  "the", "a", "an", "and", "or", "of", "for", "with",
  "your", "my", "our",
]);
```

`settings` is in the stop-word list deliberately — it shows up at almost
every product's URL root and would otherwise dominate the alias
catalogue.

### Plural / singular handling

See above. Whitelist only; no general stemmer.

### Confidence thresholds (detector-level)

The `0.6 / 0.75 / 0.85` bands from §3 — each detector clamps its own
confidence based on evidence strength. The IA index itself does not
attach confidences; that is the detector's job.

### Avoiding noisy findings

Five guardrails:
1. **Quorum.** Concept-alias detector requires ≥3 of an alias group,
   each in ≥2 files.
2. **Distinct directories.** Same-directory occurrences count as one
   for the purposes of quorum — repeated mentions inside one feature
   folder are not drift.
3. **Stop-word equivalence.** Two labels are "the same" if they match
   after lowercasing and stop-word removal. `"Settings"` and `"Settings
   Page"` are not drift.
4. **Translation key skip.** Strings shaped like `t("...")`,
   `i18n.t(...)`, `<Trans i18nKey="..." />`, `intl.formatMessage(...)`,
   and bare dotted strings (`"billing.title"`) are recorded but **not**
   used to fire drift findings.
5. **Marketing / public path downgrade.** Files under `marketing/`,
   `public/`, `landing/`, `(marketing)/` produce informational findings
   only, never `high`.

---

## 7. Finding schema implications

The current `Finding` shape (`packages/core/src/finding.ts`) already
fits IA findings cleanly. New `type` values are additive under the
existing `schema_version: "0.1.0"` (the schema docs explicitly call
this out as non-breaking).

### What works as-is

- `id` — generated by the existing sort + numbering pass.
- `type` — new machine strings: `"concept_alias_drift"`,
  `"route_metadata_drift"`, `"duplicated_navigation_source"`,
  `"missing_agent_context"`, `"orphaned_destination"`,
  `"docs_code_drift"`.
- `charge` — human strings: `"Concept Alias Drift"`, `"Route Metadata
  Drift"`, `"Duplicated Navigation Source"`, `"Missing Agent Context"`,
  `"Orphaned Destination"`, `"Docs-Code Drift"`.
- `severity`, `confidence` — existing semantics fit.
- `summary` — one-line.
- `evidence` — short factual strings; this is the load-bearing field
  for IA findings.
- `scores` — `severity`, `confidence`, `agent_risk` filled by each
  detector (the same fields shipped today).
- `suggested_actions` — new `kind` values: `"consolidate_concept"`,
  `"align_route_metadata"`, `"consolidate_nav_source"`,
  `"add_agent_context"`, `"update_agent_context"`,
  `"verify_destination_canonical"`, `"fix_doc_link"`,
  `"remove_doc_reference"`. New action `kind`s are additive
  (per stability guarantees).
- `related_files` — **finally populated** for IA findings. This is the
  field reserved since `0.1.0` for exactly this use case; IA findings
  are the natural first consumer.

### What is per-finding new but not schema-level new

`file` on the IA findings sometimes describes "the canonical anchor
file" rather than "the file in which the crime exists" — e.g. for
_Duplicated Navigation Source_, the canonical file is the first nav
source by directory order, and `related_files` lists the others. The
schema does not need to change for this; we just document the
convention in `docs/finding-types/ia.md`.

`lines` is optional in the schema; IA findings sometimes have no single
line. Existing schema already permits this.

### Optional minimal additions

If — and only if — the IA detectors need them to express findings
faithfully, propose these **additive** fields. None bumps the schema
version:

| Field             | Type                         | Status         | Rationale                                                                                       |
| ----------------- | ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `related_files`   | `string[]`                   | already exists | Populate it. Reserved since `0.1.0`.                                                            |
| `agent_guidance`  | `string`                     | **new, optional** | Per-finding short guidance line. Today this is keyed by `type` in `crimes context`; IA findings benefit from per-finding tailoring. Optional ⇒ no schema break. |

**Recommendation:** ship only `related_files` in `0.3.0`. Defer
`agent_guidance` (per-finding) unless a detector demonstrates it cannot
say what it needs to say in `summary` + `evidence`. The product
contract value of NOT adding fields is real.

Explicitly **rejected** field additions for `0.3.0`:

- `concepts: string[]` — bake into `evidence` instead.
- `routes: string[]` — bake into `evidence` instead.
- `labels: string[]` — bake into `evidence` instead.
- `permissions: string[]` — bake into `evidence` instead.

Keeping all this structured-but-typed data in `evidence: string[]`
preserves the schema's "evidence is short factual strings, always
present, always strings" discipline. Consumers wanting structured
access can re-parse the evidence strings; they're deterministic.

### Schema doc update

`docs/json-schema.md` gets:
- An expanded `Finding.type` table with the new IA `type`s.
- A new "IA findings" section documenting `related_files` as
  **populated** for IA findings (replace the current "Reserved" note
  with "Populated for IA findings; otherwise reserved").
- New `suggested_actions[].kind` values listed.

No `schema_version` bump.

---

## 8. Fixture plan

**Recommendation: extend `examples/messy-ts-app/`, do not add a new
fixture.** Reasons:

1. The existing fixture already drives `pnpm scan:example`, the smoke
   test, and the CI snapshot. Adding a second fixture splits the test
   surface and complicates the smoke test.
2. The IA crimes are most credible when they coexist with the
   structural crimes the existing fixture demonstrates — agents reading
   the fixture see "this messy repo has God Functions AND IA drift",
   which matches real-world repos.
3. The fixture's `package.json.private = true` means we can add
   directories freely without worrying about npm distribution.

### Added structure

```
examples/messy-ts-app/
├── package.json              # existing
├── AGENTS.md                 # NEW — intentionally stale (mentions a fake "ledger ask" command)
├── docs/
│   ├── billing.md            # NEW — calls the page "Plans" and "Subscriptions" inconsistently
│   ├── teams.md              # NEW — references missing './setup.md' link
│   └── commands.md           # NEW — documents non-existent CLI commands
├── src/
│   ├── billing.ts            # existing — God Function fixture
│   ├── date.ts               # existing — Temporal Recklessness fixture
│   ├── todo.ts               # existing — Unfinished Business fixture
│   ├── nav/
│   │   ├── sidebar.ts        # NEW — sidebar array; labels: { /settings/billing: "Billing" }
│   │   └── registry.ts       # NEW — route registry; labels: { /settings/billing: "Plans" }
│   ├── routes/
│   │   ├── settings/
│   │   │   ├── billing.tsx   # NEW — <title>Subscription</title>, default export PricingPage
│   │   │   └── members.tsx   # NEW — team/workspace alias drift
│   │   ├── account/
│   │   │   └── subscription.tsx  # NEW — orphaned destination (no nav reference)
│   │   └── team/
│   │       └── index.tsx     # NEW — references workspace and organisation in different places
│   └── auth/
│       └── roles.ts          # NEW — exports "owner" / "admin" alias-drift sample (informational only in 0.3.0)
```

Each new file is small (≤40 lines), explicitly commented as
intentionally messy, and demonstrates exactly one IA crime each.

### Expected detector firings on the fixture

| File / pair                                                            | Detector                          |
| ---------------------------------------------------------------------- | --------------------------------- |
| `src/routes/settings/billing.tsx` + `src/nav/{sidebar,registry}.ts`   | Route Metadata Drift, Duplicated Navigation Source |
| `src/routes/team/index.tsx` + `src/routes/settings/members.tsx`        | Concept Alias Drift (team/workspace/organisation) |
| `src/routes/account/subscription.tsx`                                  | Orphaned Destination (if shipped) |
| `AGENTS.md`                                                            | Missing Agent Context (stale command reference) |
| `docs/teams.md`                                                        | Docs-Code Drift (broken local link) |
| `docs/commands.md`                                                     | Docs-Code Drift (non-existent CLI command) |

### Snapshot updates

`docs/fixtures/messy-ts-app.json` is regenerated by `pnpm
scan:example:json` after the new fixture is in place. The smoke test
already runs against this fixture; adding files extends the smoke-test
output but does not break the assertion pattern (the assertions check
for non-empty output, not exact finding counts).

---

## 9. CLI / reporting plan

**Recommendation: ship IA findings through `crimes scan` first. Do
NOT add a new `crimes ia` command in `0.3.0`.**

Reasons:

1. **The finding schema absorbs IA cleanly.** `crimes scan --format
   json` already emits the right wire format; IA findings are just new
   `type` values inside `findings[]`.
2. **Agent loops work today.** The recommended pre-edit/post-edit loop
   (`crimes context <file> --format json`, then `crimes scan --changed
   --format json`) already gives agents both a per-file and a
   change-set view. IA findings flow through both unchanged.
3. **`crimes context <file>` becomes much more valuable.** A
   pre-edit briefing that includes "this file is one of three nav
   sources that disagree about `/settings/billing`" is exactly the
   agent-risk signal the product promises.
4. **`crimes verdict` benefits.** When a branch introduces a new
   _Route Metadata Drift_ finding, `verdict --fail-on new-high` can
   now flag it. No verdict-side work needed.
5. **No new command surface to support.** Adding `crimes ia` would
   create a parallel reporting path with its own JSON shape and CI
   semantics. That's exactly the kind of structural drift this
   release is trying to detect.

### Human-output considerations

The existing `formatHumanReport` already groups findings by severity.
IA findings will mix with structural findings in the same severity
buckets. Two small renderer additions:

- **`evidence` lines containing `→` or `:` for drift comparisons** —
  the existing renderer already wraps each `evidence` string with a
  bullet. No format change needed; just keep the evidence terse.
- **`related_files` is now populated.** Render it as a "Also touches:"
  block after the evidence list, dimmed. Two-line cap, then "+N more".

### Future `crimes ia`

If the IA detector surface grows past `0.3.0` to the point where it
needs its own report shape (cross-finding drift maps, concept graphs,
nav-source topology), introducing `crimes ia --format json` makes sense
at that point. Not yet.

---

## 10. Agent workflow impact

### `crimes context <file>`

Today: returns findings on a single file + likely tests + per-type
guidance.

`0.3.0`: with the IA index built, context can fire IA findings whose
**file** is the inspected file even when the **evidence** is on other
files. Example: agent runs `crimes context src/routes/settings/billing.tsx`
and gets back a `route_metadata_drift` finding citing the nav sources and
title literals it discovered.

`related_files` becomes load-bearing here: the agent sees the other
files it must read before editing this one.

`agent_guidance[]` for IA-type findings (still keyed by `type` per
`docs/json-schema.md`) — new entries:

| `Finding.type`                  | Guidance                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `concept_alias_drift`           | Other files describe this concept under a different name; read them before renaming or extending.       |
| `route_metadata_drift`          | The route path, title, breadcrumb, and component name disagree — verify each before changing labels.    |
| `duplicated_navigation_source`  | Multiple files declare this destination; updating only one will leave the others stale.                  |
| `missing_agent_context`         | Agent context files are missing or stale — fix them before relying on agent assistance in this area.    |
| `orphaned_destination`          | This destination is not reachable from any nav source; confirm it's intentional before treating as canonical. |
| `docs_code_drift`               | Docs reference identifiers / commands that no longer exist — update the docs in the same PR.            |

### `crimes scan --changed`

Today: scans only files changed in the working tree.

`0.3.0`: IA findings are emitted only when the **changed set** contains
enough signal to support them. A nav-source change that breaks alignment
with a route file produces a finding; a function-body edit that doesn't
touch any IA-relevant file produces no IA finding.

Critical: when the user changes a nav source, the IA detector should
flag the cross-file drift even if only the one nav file is in the
changed set. This is exactly the agent-risk wedge — the change feels
local but breaks cross-file consistency.

**Implementation note.** The IA index is built over **all discovered
files**, even in `--changed` mode. Only the **emission** of findings is
gated to changed files. Otherwise we'd lose the cross-file evidence.

### `crimes verdict`

Today: judges a branch as `cleaner | worse | unchanged | mixed` based
on new vs fixed weighted findings.

`0.3.0`: IA findings flow through the same weight system. The
`reasons[]` strings naturally surface IA crimes ("introduced 1 new
duplicated navigation source"). No code change to verdict — only the
new finding types need to be added to any verdict-specific copy.

### Agent pre-edit guidance

Three concrete examples of new value:

1. **Before editing a billing route file:**
   > Agent runs `crimes context src/routes/settings/billing.tsx
   > --format json`. New `route_metadata_drift` finding reports the
   > title, breadcrumb, and nav-label all disagree. Agent now knows to
   > update all four labels in one change.
2. **Before changing team permissions:**
   > Agent runs `crimes context src/team/permissions.ts --format
   > json`. New `concept_alias_drift` finding cites `workspace` and
   > `organisation` files using overlapping vocabulary. Agent reads
   > those files before introducing a third name.
3. **Before updating the sidebar:**
   > Agent runs `crimes context src/nav/sidebar.ts --format json`.
   > New `duplicated_navigation_source` finding lists two other nav
   > files declaring the same destination. Agent updates all three.

These are exactly the IA crimes the user wants caught — and they fall
out of the existing `crimes context` flow once the detectors land.

---

## 11. Implementation sequencing

Four prompt-sized work units. Each is small enough to land in a single
session without exhausting the context. The first three are
**sequentially dependent**; the fourth folds them together.

### Prompt A — IA concept index foundation

**Goal.** Build `packages/core/src/ia/` per §5. No detectors yet.

**Touches:**

- **Create:** `packages/core/src/ia/{types,tokens,routes,nav,labels,permissions,docs,agents,aliases,build}.ts`
- **Create:** `packages/core/src/ia/*.test.ts` (unit tests per module)
- **Create:** `packages/core/src/ia/index.ts` (public exports)
- **Edit:** `packages/language-js/src/parse.ts` — add `defaultExport`,
  `navLiterals`, `uiStringLiterals` to `ParsedFile`. Make every new field
  optional so existing code compiles.
- **Edit:** `packages/language-js/src/index.ts` — export new types.
- **Edit:** `packages/core/src/detector.ts` — add optional
  `ia?: IaIndex` to `DetectorContext`.
- **Edit:** `packages/core/src/scan.ts` — call `buildIaIndex(...)` and
  pass into each detector context.
- **Edit:** `packages/core/src/context.ts` — same.
- **Edit:** `packages/core/src/index.ts` — re-export the new IA types
  selectively (only what consumers need).

**Avoid:**

- Touching any detector file.
- Touching `packages/reporter/`.
- Touching `apps/website/` or `README.md` or `ROADMAP_STATUS.md`.
- Bumping `schema_version`.
- Bumping `packages/cli/package.json` version.

**Acceptance.** `pnpm build && pnpm typecheck && pnpm test` passes
with no IA findings emitted yet — only the index plumbing is in place.

---

### Prompt B — First IA detectors

**Goal.** Ship the four must-ship + should-ship detectors per §4.

**Touches (create one detector + test pair per detector):**

- `packages/core/src/detectors/missing-agent-context.ts` + `.test.ts`
- `packages/core/src/detectors/route-metadata-drift.ts` + `.test.ts`
- `packages/core/src/detectors/duplicated-navigation-source.ts` + `.test.ts`
- `packages/core/src/detectors/concept-alias-drift.ts` + `.test.ts`
- `packages/core/src/detectors/docs-code-drift.ts` + `.test.ts`

**Edit:**

- `packages/core/src/scan.ts` — register the new detectors in
  `builtInDetectors`.
- `packages/core/src/index.ts` — export the new detectors.
- `packages/core/src/context.ts` — extend the `GUIDANCE` map with the
  six new entries (per §10).

**Avoid:**

- Touching `packages/language-js/` (Prompt A already shipped what's
  needed).
- Touching the IA index module (extractors are stable by this point).
- Renaming any existing detector or schema field.
- Touching `apps/website/`.

**Acceptance.** `pnpm test` passes with all detector tests green.
`pnpm scan:example` produces at least three new IA findings on the
(still-unchanged) fixture — or zero, if the fixture hasn't been
extended yet. Prompt C handles the fixture.

---

### Prompt C — Fixture + docs

**Goal.** Demonstrate the new detectors and update docs (NOT website
yet).

**Touches:**

- **Create fixture files** per §8:
  - `examples/messy-ts-app/AGENTS.md`
  - `examples/messy-ts-app/docs/{billing,teams,commands}.md`
  - `examples/messy-ts-app/src/nav/{sidebar,registry}.ts`
  - `examples/messy-ts-app/src/routes/settings/{billing,members}.tsx`
  - `examples/messy-ts-app/src/routes/account/subscription.tsx`
  - `examples/messy-ts-app/src/routes/team/index.tsx`
  - `examples/messy-ts-app/src/auth/roles.ts`
- **Edit:** `docs/json-schema.md` — new `Finding.type` rows; new
  `suggested_actions[].kind` entries; expanded `related_files`
  description.
- **Edit:** `docs/agent-usage.md` — add an "IA findings" subsection
  walking the agent through the new types and their `agent_guidance`.
- **Create:** `docs/finding-types/ia.md` — long-form per-detector
  reference (charges, evidence shapes, false-positive notes).
- **Edit:** `docs/fixtures/messy-ts-app.json` — regenerate from
  `pnpm scan:example:json`.

**Avoid:**

- Touching the website (`apps/website/`) — Prompt D.
- Touching `README.md` — Prompt D.
- Touching `ROADMAP_STATUS.md` other than the pointer-line update
  (already done as part of this planning task).
- Changing detector code (Prompt B is final).

**Acceptance.** `pnpm scan:example` produces the expected mix of
existing structural findings and new IA findings. Snapshot tests pass.

---

### Prompt D — Integration / schema / release prep

**Goal.** Final wrap. Reporter polish, README, website,
`ROADMAP_STATUS.md` ship-card, `llms.txt`. No version bump in this
prompt — `0.3.0` ships under a separate release-recipe step (`docs/
releasing.md`).

**Touches:**

- **Edit:** `packages/reporter/src/human.ts` — render `related_files`
  block ("Also touches:" with two-line cap) for findings that populate
  it.
- **Edit:** `packages/reporter/src/reporter.test.ts` — cover the new
  rendering.
- **Edit:** `README.md` — add IA detectors to the "What it finds"
  table; add a one-paragraph "IA crimes" section above "CI"; update
  the "What's next" section to reflect what `0.3.0` actually shipped.
- **Edit:** `ROADMAP_STATUS.md` — replace the "🎯 Next target" block
  with a "🟢 Release candidate — `crimes@0.3.0`" block listing what
  shipped, mirroring the `0.2.0` block's structure.
- **Edit:** `apps/website/src/index.html` — add IA-detector copy to
  the homepage.
- **Edit:** `apps/website/src/llms.txt` — replace the "Next theme"
  section with a "Shipped in v0.3.0" section.
- **Edit:** `AGENTS.md` — extend the "Not yet implemented" list (move
  the IA items out of it; add what remains deferred).

**Avoid:**

- Bumping `packages/cli/package.json` to `0.3.0` — that is the
  separate `docs/releasing.md` step.
- Running `pnpm changeset publish` or `git tag`.
- Editing `PRD.md` — the PRD is the spec; status mirrors live in
  `ROADMAP_STATUS.md`.

**Acceptance.** `pnpm build && pnpm typecheck && pnpm test && pnpm
scan:example && pnpm --filter crimes smoke` all pass.

---

### One agent or multiple worktree agents?

**Recommendation: one agent, four sequential prompts, no worktrees.**

Reasons:

- Prompts A → B → C → D are **strictly sequential**. B depends on the
  index from A. C depends on the detectors from B. D depends on the
  fixture from C.
- The token budget per prompt is modest. None of these four prompts
  needs to read more than ~20 source files.
- The change is isolated to `packages/core/src/ia/`,
  `packages/core/src/detectors/`, `packages/language-js/src/parse.ts`,
  the fixture, and docs — no parallel workstreams to coordinate.
- A worktree-based plan only helps when independent work runs in
  parallel; here, the dependency chain is linear.

**If a future enhancement breaks this pattern:** the natural fork
point is the per-detector work in Prompt B. If, after Prompts A and C
are stable, the team wants to add Orphaned Destination or Permission
IA Drift in parallel, those individual detectors can be parallel
subagents off a stable A+B base.

---

## 12. Risks and mitigations

| Risk                                                                                  | Mitigation                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **False positives undermine trust in IA findings.**                                  | Quorum rules in §6. Confidence honesty. "Appears" / "may" language in every `summary`. Never assert truth — assert evidence.              |
| **Semantic guesses look like LLM output.**                                           | Carry the file path / line evidence into every finding. If a finding cannot cite a file, it does not fire.                                |
| **Framework differences:** Next.js Pages vs App Router vs Remix vs React Router.    | Route discovery is **convention-based** — `src/(pages|app|routes|screens)/**/*.{ts,tsx,...}`. Document the convention. Add config later.  |
| **Translation keys break label extraction.**                                         | Translation-key detection in §6 — `t("...")`, dotted-string literals, `<Trans i18nKey>` patterns are recorded but not used for drift.     |
| **Large repos make the IA index slow.**                                              | Build the index in the same pass as `discoverFiles` + `parseFile`. Cap doc walking at a small extension set. Profile with the crimes-repo-on-itself run before declaring ship. |
| **Docs drift on `crimes` itself.**                                                   | Docs-Code Drift detector covers this. The crimes repo eats its own dog food.                                                              |
| **Users distrust the new findings if they overclaim.**                               | Every detector ships with: an evidence list; a confidence band documented in `docs/finding-types/ia.md`; an explicit "false positives" subsection. |
| **Schema churn.**                                                                    | Strictly additive changes. No `schema_version` bump in `0.3.0`. New `Finding.type` values, new `suggested_actions[].kind` values only.    |
| **Agent context detection misfires on monorepos.**                                  | Walk up to the workspace root before declaring `AGENTS.md` "missing". Read `package.json` `bin` from the relevant package, not the cwd.   |
| **Concept Alias Drift fires on intentional aliases (migration files, compat shims).**| Built-in skip patterns for files matching `compat/`, `legacy/`, `migration/`, `*-compat.ts`. Document the skip pattern. Allow config override later. |
| **Route Metadata Drift fires on layouts that wrap multiple routes.**                 | Only inspect the leaf route file (skip files whose default export is a layout component named `Layout` / `*Layout`).                       |

---

## 13. Success criteria

`0.3.0` is "good enough" to ship when **all** of these are true:

1. **Deterministic.** Two runs over the same repo produce identical
   IA findings (same ids, same evidence). No randomness, no time-based
   inputs.
2. **Low-noise on the crimes repo itself.** Running `crimes scan` on
   the crimes monorepo produces ≤2 IA findings (currently expected to
   produce 0 because the repo is small and self-consistent). Any
   finding that fires must be a real ambiguity, not noise.
3. **Clear evidence.** Every IA finding's `evidence[]` is concrete —
   file paths, line numbers, string literals, route paths. No
   speculation, no judgement, no "looks like" without a citation.
4. **Useful on the fixture.** `pnpm scan:example` produces at least
   one finding from each of the four shipped IA detectors against
   `examples/messy-ts-app/`, and each finding's evidence points at the
   fixture files we deliberately drifted.
5. **No LLM dependency.** `grep -r 'anthropic\|openai\|claude' packages/`
   returns nothing in the IA module. The detectors run offline.
6. **Docs frame findings as ambiguity, not truth.** `docs/finding-types/ia.md`
   uses "appears" / "may" / "looks like" language consistently.
   `agent_guidance[]` does not tell the agent to fix the crime; it
   tells the agent to read more before editing.
7. **Tests cover extraction and classification.**
   - Extraction tests for `tokens.ts`, `routes.ts`, `nav.ts`, `labels.ts`,
     `permissions.ts`, `docs.ts`, `agents.ts`, `aliases.ts`.
   - Classification tests for each detector with at least one positive
     case and one negative case.
   - The crimes repo's own CI (`pnpm test`) is green.
8. **Schema unchanged.** `schema_version` is still `"0.1.0"`. No
   field name changes, no required-→optional transitions, no type
   changes. Only additive: new `type` values, new `kind` values,
   `related_files` newly populated.
9. **Smoke test passes.** `pnpm --filter crimes smoke` still runs the
   full pack → install → invoke loop against the fixture and exits
   clean.
10. **Existing commands unchanged.** `crimes scan` / `context` /
    `hotspots` / `diff` / `baseline` / `verdict` produce the same
    output shape they did in `0.2.0`. IA findings are additive inside
    `findings[]`.

---

## 14. Open questions

These should be resolved before the implementation prompts go out, OR
explicitly deferred with a documented default:

1. **Alias-group catalogue source.** Bake the catalogue in
   `packages/core/src/ia/aliases.ts`, or load from
   `crimes.config.json`? **Suggested default for `0.3.0`:** bake it in.
   Move to config only if users ask. (Config plumbing is deferred
   anyway.)
2. **Route conventions.** Stick with the
   `src/(pages|app|routes|screens)/**` glob set, or auto-detect by
   inspecting `next.config.js` / `remix.config.js` / `package.json`?
   **Suggested default:** stick with the glob set; auto-detect can
   land in `0.4.0`.
3. **Markdown extraction depth.** Walk just `docs/` and root-level
   `*.md`, or any `*.md` under the included paths? **Suggested
   default:** root-level `*.md` + everything under `docs/`. Document
   the convention.
4. **`AGENTS.md` discovery in monorepos.** Walk up from the scanned
   root to the nearest `.git/`, or only check the scanned root?
   **Suggested default:** only the scanned root. The crimes repo
   already lives at the repo root; sub-package scans can be addressed
   in a later release.
5. **Confidence threshold for emission.** Drop findings whose
   confidence is below a fixed floor (e.g. `< 0.55`), or always emit
   them so the user can see the band? **Suggested default:** emit
   everything, let the user filter via the existing `--severity`
   surface (which is per-severity, not per-confidence, but works in
   practice).
6. **Should `crimes context <file>` build the IA index over the whole
   repo or only the directory of `<file>`?** **Suggested default:**
   the whole repo. IA findings are cross-file by definition; scoping
   the index to one directory loses signal.
7. **Reporting performance.** Building the IA index over a large repo
   (Next.js app with 200 route files, 10k source files) — how slow is
   it? **Suggested default:** profile during Prompt A; if the IA
   pre-pass slows `crimes scan` by >2× on the crimes repo, time-box
   the doc walker and degrade gracefully.
8. **Should _Concept Alias Drift_ ship at all if it fires noisily on
   one real repo?** **Suggested default:** the "Should ship" bucket is
   exactly the place to hold this decision. Re-evaluate after Prompt
   B's tests are green and Prompt C's fixture firing is observed.

---

## Quick reference for the implementation agent

### Where to put new code

| Concern                           | Location                                               |
| --------------------------------- | ------------------------------------------------------ |
| IA index (extractors + types)     | `packages/core/src/ia/`                                |
| TS/JS AST surface for IA          | `packages/language-js/src/parse.ts` (additive)         |
| New detectors                     | `packages/core/src/detectors/<detector>.ts` + `.test.ts` |
| Detector registration             | `packages/core/src/scan.ts::builtInDetectors`           |
| Per-finding agent guidance        | `packages/core/src/context.ts::GUIDANCE`                |
| Reporter (related_files rendering) | `packages/reporter/src/human.ts`                        |
| Finding-type docs                 | `docs/finding-types/ia.md` (new)                        |
| Schema doc updates                | `docs/json-schema.md`                                   |
| Agent-usage doc updates           | `docs/agent-usage.md`                                   |
| Fixture                           | `examples/messy-ts-app/`                                |

### What NOT to touch

- `packages/cli/package.json` version field.
- `schema_version` in `packages/core/src/finding.ts`.
- Any shipped detector (`large-function.ts`, `large-file.ts`,
  `todo-density.ts`, `direct-date.ts`).
- The `Finding.evidence` contract (still `string[]`).
- The `ScanReport` / `ContextReport` / `HotspotsReport` / `DiffReport`
  / `Baseline` / `BaselineCheckReport` / `VerdictReport` shapes
  beyond the additive `Finding.related_files` already reserved.
- The release workflow (`.github/workflows/release.yml`).
- The smoke test (`packages/cli/smoke.*`).

### Verification commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm scan:example
pnpm scan:example:json
pnpm --filter crimes smoke
```
