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
