# `crimes` JSON output schema

`crimes scan --format json` emits a single JSON document — the `ScanReport`.
This document is the **stable product API**. Treat it as a public contract:
any breaking change to a field name, type, or required-ness will bump
`schema_version`.

This page documents the schema as of `schema_version: "0.1.0"`. The source
of truth in code is
[`packages/core/src/finding.ts`](../packages/core/src/finding.ts).

For how an agent should _use_ this output, see
[`agent-usage.md`](./agent-usage.md).

---

## Top-level shape

```ts
interface ScanReport {
  schema_version: "0.1.0";
  repo: RepoInfo;
  summary: ScanSummary;
  findings: Finding[];
}
```

### `schema_version`

The wire format version. Always present, always a string. Bumped on any
breaking change to the shape of `Finding`, `ScanSummary`, or `RepoInfo`.

Consumers should refuse to parse a report whose `schema_version` they do not
recognise.

### `repo`

```ts
interface RepoInfo {
  /** Basename of the scanned root directory. */
  name: string;
  /** Absolute path to the scanned root, machine-specific. */
  root: string;
  /** Optional git ref the scan ran against. Not yet populated. */
  git_ref?: string;
}
```

`root` is an absolute filesystem path on the machine that ran the scan. Useful
to anchor `findings[].file` (which is repo-relative), but not stable across
machines or containers.

`git_ref` is reserved for a future milestone that wires up git history.

### `summary`

```ts
interface ScanSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
}
```

Counts by severity. `total` equals the sum of the three buckets.

### `findings`

Array of `Finding` objects, sorted:

1. By severity (`high → medium → low`)
2. Then by `confidence` descending
3. Then by `file` ascending
4. Then by `lines[0]` ascending

IDs (`crime_00001`, `crime_00002`, …) are assigned in this sort order, so they
are stable as long as the underlying detector results are stable.

---

## `Finding`

```ts
interface Finding {
  /** Stable per-scan id, e.g. "crime_00001". */
  id: string;
  /** Machine-readable detector type, e.g. "large_function". */
  type: string;
  /** Human-readable charge, e.g. "God Function". */
  charge: string;
  severity: "low" | "medium" | "high";
  /** 0–1 confidence. */
  confidence: number;
  /** Repo-relative path with forward slashes. */
  file: string;
  /** Function/class/method name when applicable. */
  symbol?: string;
  /** Inclusive [start, end] 1-based line range. */
  lines?: [number, number];
  /** One-line natural-language summary. */
  summary: string;
  /** Concrete evidence — short factual strings, deterministic. */
  evidence: string[];
  scores: FindingScores;
  suggested_actions?: SuggestedAction[];
  /** Reserved — not yet populated. */
  related_files?: string[];
}
```

### Required vs optional

Always present on every finding:

- `id`, `type`, `charge`, `severity`, `confidence`, `file`, `summary`,
  `evidence`, `scores`

Populated when the detector has the data:

- `symbol` — set for findings that name a specific function/class/method
  (e.g. `large_function`). Absent for file-level findings.
- `lines` — set for any finding with a meaningful line range. All built-in
  detectors populate this in v0.1.0.
- `suggested_actions` — set for every built-in detector in v0.1.0, but
  optional in the schema.

Reserved (declared in the schema, deferred to later milestones):

- `related_files` — cross-file context, e.g. nearby tests, similar functions
- `scores.blast_radius`, `scores.churn`, `scores.test_gap` — see below

### `id`

A scan-local identifier in the form `crime_NNNNN` (5-digit zero-padded). IDs
are assigned after sorting, so a given finding may get a different id between
runs if the set of findings changes. Use `id` for citing within a single
report; do not persist it across scans.

### `type`

Machine identifier for the detector that produced the finding. Stable. v0.1.0
emits the following values:

| `type`             | Charge                  | Symbol set? | What it flags                                                        |
| ------------------ | ----------------------- | ----------- | -------------------------------------------------------------------- |
| `large_file`       | `God File`              | no          | Files over `thresholds.largeFileLines` (default 300)                  |
| `large_function`   | `God Function`          | yes         | Functions/methods/arrows over `thresholds.largeFunctionLines` (60)    |
| `todo_density`     | `Unfinished Business`   | no          | High `TODO/FIXME/XXX/HACK` density vs `thresholds.todoDensityPerKLoc` |
| `direct_date`      | `Temporal Recklessness` | no          | Direct `Date.now()` or `new Date()` usage                             |

### `charge`

Human-readable label for `type`. Stable for a given `type`. Use this in
user-facing summaries; use `type` in code that branches on detector kind.

### `severity` and `confidence`

`severity` is one of `"low" | "medium" | "high"`. It's the headline triage
signal: how bad this looks in isolation, ignoring blast radius and churn.

`confidence` is `0–1`. It reflects how sure the detector is that the smell is
real (e.g. a function that's 2× the line threshold has higher confidence than
one just barely over). Rounded to two decimals.

### `file` and `lines`

`file` is always **repo-relative**, with forward slashes regardless of OS.
Resolve against `repo.root` if you need an absolute path.

`lines` is `[startLine, endLine]`, both inclusive, both 1-based. When a
detector reports on the whole file, `lines` is `[1, lineCount]`. For
`todo_density`, `lines` spans from the first marker to the last marker.

### `symbol`

The function, method, or accessor name when the detector pinpoints a specific
declaration. May be `"<anonymous>"` when the detector found a function but
couldn't infer its name.

### `evidence`

An array of short factual strings (typically 2–4 items). Every item is
generated deterministically from the file/AST — no LLM. Quote evidence
verbatim when explaining a finding to a user. Examples:

```
"lines 37–240 (204 lines)"
"3.4× the configured 60-line threshold"
"function declaration"
"5× Date.now(), 2× new Date()"
"lines: 44, 50, 79, 185, 225, 237, 260"
"6× TODO, 4× FIXME, 2× HACK, 2× XXX"
"424.2 markers per 1k LOC (threshold 10)"
```

### `scores`

```ts
interface FindingScores {
  /** How bad the smell is in isolation (0–1). Always present. */
  severity: number;
  /** Detector certainty (0–1). Always present. */
  confidence: number;
  /** Reserved — cross-repo blast radius. Not populated in v0.1.0. */
  blast_radius?: number;
  /** Reserved — git churn signal. Not populated in v0.1.0. */
  churn?: number;
  /** Reserved — test-proximity signal. Not populated in v0.1.0. */
  test_gap?: number;
  /** 0–1, how likely an AI agent is to misread/damage this area. */
  agent_risk?: number;
}
```

The `severity` / `confidence` here are the numeric versions of the top-level
fields. `agent_risk` is the differentiating signal vs other tools: rank by
`agent_risk` when your goal is "which areas are dangerous for me to edit",
not "which areas have the worst static smell".

`blast_radius`, `churn`, and `test_gap` are deliberately omitted in v0.1.0 —
they require git history and cross-file analysis that hasn't shipped yet.
Treat absence as "not computed", not "zero".

All score fields are rounded to two decimals when present.

### `suggested_actions`

```ts
interface SuggestedAction {
  /** Stable machine-readable action id, e.g. "extract_function". */
  kind: string;
  /** Human-readable suggestion. */
  description: string;
  /** Estimated risk of doing this action: "low" | "medium" | "high". */
  risk: "low" | "medium" | "high";
}
```

`kind` values shipped in v0.1.0:

- `extract_function` — break up a large function into named helpers
- `split_file` — split a large file along responsibility boundaries
- `triage_todos` — convert TODO markers into tracked issues or remove them
- `inject_clock` — replace direct `Date` usage with an injected clock

These are deterministic — one per detector kind. They are **suggestions**, not
instructions; pick the ones that match the user's request.

### `related_files`

Reserved. Once `crimes` ships cross-file analysis (e.g. nearby tests,
duplicates, alternate sources of truth), this will list repo-relative paths
that an agent should also read.

---

---

## `ContextReport` (output of `crimes context <file>`)

`crimes context <file> --format json` emits a single JSON document — the
`ContextReport`. It shares `schema_version` and the `Finding` shape with
`ScanReport`, but is keyed to one file:

```ts
interface ContextReport {
  schema_version: "0.1.0";
  repo: { name: string; root: string; git_ref?: string };
  /** Repo-relative path of the inspected file. */
  file: string;
  risk: ContextRisk;
  /** Same Finding shape as ScanReport, filtered to `file`. */
  findings: Finding[];
  /** Repo-relative paths of test files likely covering `file`. Sorted. */
  likely_tests: string[];
  /** One short line per finding type that fired, deduped. Stable order. */
  agent_guidance: string[];
}

interface ContextRisk {
  /** Worst severity present in `findings`. `"none"` when there are none. */
  level: "none" | "low" | "medium" | "high";
  high: number;
  medium: number;
  low: number;
  /** findings.length */
  total: number;
}
```

### `likely_tests`

Discovered by three deterministic conventions, in this order:

1. Sibling files with the same basename and a `.test.{ts,tsx,js,jsx,mjs,cjs}`
   or `.spec.{...}` extension.
2. Files under any `__tests__/` directory whose basename (with any
   `.test`/`.spec` infix stripped) matches the target's basename.
3. Test files (matching either of the above conventions) whose source
   contains a relative-path import that resolves to the target file.

The result is deduped and lexically sorted. No git history, no symbol
resolution beyond a textual import-path match.

### `agent_guidance`

Static lookup keyed on `Finding.type`. One line per type that appears in
`findings`, in the order they first appear. Current keys:

| `Finding.type`    | Guidance                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| `large_function`  | Prefer extracting pure helpers before adding more branches.             |
| `large_file`      | Read the whole file before editing — propose splits in their own change. |
| `direct_date`     | Avoid adding more direct clock access; inject time where possible.       |
| `todo_density`    | Review TODOs before relying on comments as current intent.              |

New detector `type`s may add new guidance lines without bumping
`schema_version`. The **wording** of an existing guidance line is not part
of the schema contract — treat it as advisory copy, not a stable string to
match on.

---

## `HotspotsReport` (from `crimes hotspots --format json`)

```ts
interface HotspotsReport {
  schema_version: "0.1.0";
  repo: RepoInfo;
  /** Echo of the `--since` value the user passed (e.g. "90d"). */
  since: string;
  /** False when the directory is not a git repository or `git` is unavailable. */
  git_available: boolean;
  hotspots: Hotspot[];
}

interface Hotspot {
  /** Repo-relative path with forward slashes. */
  file: string;
  /** Commits in the `--since` window that touched this file. */
  change_count: number;
  /** ISO-8601 timestamp of the most recent commit. Absent when change_count is 0. */
  latest_change?: string;
  /** Number of `crimes scan` findings on this file. */
  finding_count: number;
  /** Worst severity present in findings. `"none"` when finding_count is 0. */
  highest_severity: "none" | "low" | "medium" | "high";
  /** Aggregate 0–1 change-risk score, rounded to 2 dp. */
  risk: number;
}
```

### Sorting

`hotspots` is sorted:

1. By `risk` descending
2. Then `change_count` descending
3. Then `highest_severity` descending (`high → medium → low → none`)
4. Then `file` ascending — as a stable tie-breaker

### `risk` formula (v0.1.0)

```text
risk = 0.6 × min(change_count / 20, 1)
     + 0.4 × { high: 1.0, medium: 0.6, low: 0.3, none: 0 }[highest_severity]
```

Rounded to 2 decimal places. The 20-commit cap and the 0.6 / 0.4 weights are
the **numeric formula** — they may change between minor releases. Treat
`risk` as an **ordinal** signal for ranking, not an exact measurement (same
contract as the per-finding `scores.*` fields).

### Non-git directories

When `git_available` is `false`, every row has `change_count: 0` and no
`latest_change`. `risk` then collapses to the severity component only and is
capped at `0.4`. The command does not fail — it degrades.

---

## `DiffReport` (output of `crimes diff <base...head>`)

`crimes diff <base...head> --format json` emits a single JSON document — the
`DiffReport`. It shares `schema_version` and the `Finding` shape with
`ScanReport`, but the body is grouped by what changed between the two refs
rather than listed flat.

```ts
interface DiffReport {
  schema_version: "0.1.0";
  /** Discriminator. Always the literal "diff". */
  report_type: "diff";
  repo: { name: string; root: string };
  /** Base ref the user passed (e.g. "main", "origin/main", a SHA). */
  base: string;
  /** Head ref the user passed (typically "HEAD"). */
  head: string;
  summary: DiffSummary;
  /** Findings present at `head` but not at `base`. */
  new_findings: Finding[];
  /** Findings present at `base` but not at `head`. */
  fixed_findings: Finding[];
  /**
   * Findings present at both refs (matched by fingerprint).
   * The Finding object comes from the `head` scan, so its
   * `lines`, `evidence`, and per-scan `id` reflect HEAD.
   */
  unchanged_findings: Finding[];
}

interface DiffSummary {
  new: number;
  fixed: number;
  unchanged: number;
}
```

### `report_type`

A discriminator literal so consumers can route on the report kind when
multiple shapes are piped together. `ScanReport`, `ContextReport`, and
`HotspotsReport` do not currently carry `report_type` — they are
disambiguated by their distinctive top-level keys (`findings`, `file`,
`hotspots`). `DiffReport` adds the field defensively because its body
contains keys (`new_findings`, `fixed_findings`, `unchanged_findings`)
that future report types might also want to use.

### How findings are matched (fingerprinting)

Findings are classified as `new` / `fixed` / `unchanged` by a stable
fingerprint, **not** by the per-scan `id`. The fingerprint is:

```
<type>::<file>::<symbol-or-empty>
```

- `type` — detector identity (`large_function`, `large_file`, …)
- `file` — repo-relative POSIX path
- `symbol` — function/method name when the detector pinpoints a
  declaration (e.g. `large_function`); empty for file-level detectors

The fingerprint deliberately excludes `lines`, `evidence`, `summary`, and
the per-scan `id`. That means a function shifting from lines 37–240 to
lines 42–246 after an unrelated edit above it is classified as
`unchanged`, not as a fix + new pair.

Source of truth: [`packages/core/src/fingerprint.ts`](../packages/core/src/fingerprint.ts).

### Sort order within each group

`new_findings`, `fixed_findings`, and `unchanged_findings` each preserve
the order their underlying scan produced — i.e. the same severity-first
order documented for [`ScanReport.findings`](#findings):

1. By severity (`high → medium → low`)
2. Then by `confidence` descending
3. Then by `file` ascending
4. Then by `lines[0]` ascending

### How the refs are scanned

`crimes diff` exports each ref into a fresh temporary directory via
`git archive <ref> | tar -x` and scans it there. The working tree is
**never** touched: no checkout, no stash, no temporary commits. Both
temp directories are cleaned up before the report is returned.

### Known limitations

- **File renames register as a fix + new pair.** A file moved from
  `src/a.ts` to `src/b.ts` between `base` and `head` will produce both
  fixed findings (from `a.ts`) and new findings (in `b.ts`), even if the
  underlying detector results are identical. This matches the default
  behaviour of `git diff` (without `--find-renames`).
- **Two findings with identical `(type, file, symbol)` collide on one
  fingerprint.** Nested helpers or overloaded function declarations with
  the same name in the same file deduplicate to a single logical
  finding. Rare in practice; a future schema version may add a
  disambiguator if it becomes a problem.

### Exit codes

`crimes diff` currently exits `0` even when new findings are present.
`--fail-on new-high` (the canonical CI gate) ships later in `0.2.0`
alongside baseline support. Until then, gate on the JSON yourself:

```bash
crimes diff origin/main...HEAD --format json \
  | jq -e '.summary.new == 0' >/dev/null
```

---

## `Baseline` (on-disk shape of `.crimes/baseline.json`)

`crimes baseline save` writes a single JSON document to
`<root>/.crimes/baseline.json`. The file is **intended to be committed** — it
pins the set of pre-existing findings that future `crimes baseline check`
runs should ignore. The schema is versioned by the same `schema_version` as
`ScanReport`.

```ts
interface Baseline {
  schema_version: "0.1.0";
  /** Discriminator. Always the literal "baseline". */
  report_type: "baseline";
  /** ISO-8601 timestamp at which the baseline was written. */
  created_at: string;
  /** Version of `crimes` that wrote the file. Optional. */
  crimes_version?: string;
  /** Best-effort repo identity. `root` is machine-specific — informational only. */
  repo?: { name: string; root: string };
  /** Severity counts at the moment the baseline was written. */
  summary: ScanSummary;
  /** Every finding present at capture time, trimmed to identity-only fields. */
  findings: BaselineEntry[];
}

interface BaselineEntry {
  /** Same `<type>::<file>::<symbol-or-empty>` as `fingerprintFinding`. */
  fingerprint: string;
  type: string;
  charge: string;
  severity: "low" | "medium" | "high";
  file: string;
  symbol?: string;
}
```

### Why this shape

The baseline only needs enough per-finding data to (a) match a future scan
via the same fingerprint logic `crimes diff` uses, and (b) render a useful
`fixed_findings` list when the offending file no longer exists. Concretely
this means **no** `lines`, `evidence`, `summary`, `scores`,
`suggested_actions`, or per-scan `id` is persisted — those drift between
scans or become meaningless after the underlying code is gone.

### How `crimes baseline check` matches findings

By the exact same fingerprint logic as
[`crimes diff`](#diffreport-output-of-crimes-diff-basehead): the stable
`<type>::<file>::<symbol-or-empty>` identity. Small line shifts from
unrelated edits do not register as fix + new. The known limitations are
the same too: file renames register as a fix + new pair, and two findings
with identical `(type, file, symbol)` collide on one fingerprint.

---

## `BaselineCheckReport` (output of `crimes baseline check`)

```ts
interface BaselineCheckReport {
  schema_version: "0.1.0";
  /** Discriminator. Always the literal "baseline_check". */
  report_type: "baseline_check";
  repo: { name: string; root: string };
  /** Absolute path to the baseline file that was loaded. */
  baseline_path: string;
  /** Threshold the run used to decide `failed`. */
  fail_on: "low" | "medium" | "high";
  /** True when at least one new finding has severity ≥ `fail_on`. */
  failed: boolean;
  summary: BaselineCheckSummary;
  /** Full `Finding` objects from the current scan not present in the baseline. */
  new_findings: Finding[];
  /** Baseline entries with no matching fingerprint in the current scan. */
  fixed_findings: BaselineEntry[];
  /** Current-scan findings matched by fingerprint to a baseline entry. */
  unchanged_findings: Finding[];
}

interface BaselineCheckSummary {
  total_baseline: number;
  total_current: number;
  new: number;
  fixed: number;
  unchanged: number;
  new_by_severity: { high: number; medium: number; low: number };
}
```

### `fail_on` semantics

| Value      | A new finding fails when its severity is …       |
| ---------- | ------------------------------------------------ |
| `"low"`    | low, medium, or high                             |
| `"medium"` | medium or high _(default)_                       |
| `"high"`   | high only                                        |

`failed` is the AND of "at least one new finding" and "the worst new
severity meets the threshold". `fixed_findings` and `unchanged_findings`
never influence `failed` — only forward debt blocks CI.

### Exit codes

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | `failed: false` — no new findings at or above `fail_on`.                      |
| `1`  | `failed: true` — at least one new finding at or above `fail_on`.              |
| `2`  | Usage / environment error — missing baseline, malformed baseline, bad flags.  |

The JSON output is produced on stdout for exit `0` and `1`. Exit `2`
writes a single human-readable error line to stderr and emits no JSON.

### Why `fixed_findings` is `BaselineEntry[]`, not `Finding[]`

Unlike `DiffReport`, where both refs are scanned and the full `Finding`
shape is available on both sides, the baseline file only stores the
trimmed `BaselineEntry` per finding. A finding can be reported as "fixed"
even when the offending code has been deleted entirely — at which point
the original `lines`, `evidence`, and `scores` no longer make sense to
serialise.

---

## Stability guarantees

Within a single `schema_version`:

- Field **names** in the JSON output never change.
- Field **types** never change.
- A required field never becomes optional, or vice versa.
- New detector `type` values may be added without bumping the schema —
  consumers should treat unknown `type`s defensively.
- New `kind` values for `suggested_actions` may be added without bumping.
- The numeric formulas behind `severity`, `confidence`, and `agent_risk`
  scores **may change** between minor releases. Treat scores as ordinal
  signals, not exact measurements.

Breaking changes bump `schema_version` and are called out in release notes.
