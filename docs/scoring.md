# Scoring

Every `crimes` finding carries five numeric scores in [0, 1]:

| Score          | Source                                          | "Higher means" |
| -------------- | ----------------------------------------------- | -------------- |
| `severity`     | Detector — how bad the smell is in isolation    | More severe    |
| `confidence`   | Detector — how certain the detector is          | More certain   |
| `churn`        | Git log over a 90-day window                    | Edits more     |
| `test_gap`     | Filesystem + import-graph test discovery        | Less tested    |
| `blast_radius` | Import-graph transitive closure                 | Touches more   |
| `agent_risk`   | Unified composite of all five                   | Riskier to AI edits |

Rank by `agent_risk` when the question is "which areas are dangerous to
edit"; rank by `severity` when the question is "which findings are
worst in isolation".

## Status by version

| Version  | `severity` / `confidence` | `churn` / `test_gap` / `blast_radius` | `agent_risk` |
| -------- | ------------------------- | ------------------------------------- | ------------ |
| 0.1–0.5  | Populated                 | Reserved (always absent)              | Populated by detector |
| 0.6+     | Populated                 | **Populated** from the scoring context | Populated from the unified formula |

All fields are rounded to two decimal places.

## The unified `agent_risk` formula

`agent_risk` is recomputed for every finding after detectors emit. The
0.6.0 formula:

```
agent_risk = clamp01(
    0.4  * severity_numeric
  + 0.2  * confidence
  + 0.15 * churn
  + 0.15 * test_gap
  + 0.10 * blast_radius
)
```

`severity_numeric` maps the categorical `severity` to a numeric value:

| `severity` | numeric |
| ---------- | ------- |
| `high`     | 0.9     |
| `medium`   | 0.7     |
| `low`      | 0.45    |

These mappings match the convention pre-0.6.0 detectors used, so the
ordering of existing high-severity findings is preserved when the new
signals are zero.

## How each signal is computed

### `churn`

```
churn[file] = min(commits_touching_file_in_last_90_days / 20, 1)
```

The same saturation curve `crimes hotspots` uses for the change-frequency
component of `risk`. The window can shift in future releases — the
contract is "higher is worse, range [0, 1]", not "this exact number".

When the repo isn't a git working tree, or the `git` binary isn't
available, `churn` is `0` for every file and the scoring context's
internal `limited` flag is set. The hotspots command already documents
this case under `history_limited`.

### `test_gap`

A three-tier signal derived from filesystem layout and the import graph:

| `test_gap` | Condition                                                                       |
| ---------- | ------------------------------------------------------------------------------- |
| `0.0`      | The file is *itself* a test file (e.g. `foo.test.ts`), **or** at least one test file imports it. |
| `0.5`      | A sibling test file exists (`foo.test.ts` next to `foo.ts`) **or** a `__tests__/` test file shares the basename, but no test file actually imports the target. |
| `1.0`      | None of the above.                                                              |

Test files are recognised by the standard pattern: anything under
`__tests__/`, or any file matching `.test.{ts,tsx,js,jsx,mjs,cjs}` or
`.spec.{…}`.

### `blast_radius`

```
blast_radius[file] = min(transitive_importers / 50, 1)
```

Where `transitive_importers` is the count of distinct repo files that
reach the target via one or more import edges. The traversal is memoised
per file so the per-scan cost stays O(F).

When the import graph isn't available, `blast_radius` is `0` for every
file. The graph is built once per scan and shared across every detector
via `DetectorContext.imports`.

## Stability guarantees

`severity` and `confidence` continue to be the "stable" knobs detectors
calibrate against. `churn`, `test_gap`, and `blast_radius` are
**ordinal** — treat the exact numbers as advisory; the formulae may
shift between minor releases as the underlying heuristics are refined.
The contracts that don't shift:

- Range is always [0, 1], rounded to two decimal places.
- Direction is always "higher is worse".
- `agent_risk` is monotonic in each of its five inputs.

The exact `agent_risk` weighting itself may also shift between minor
releases. Consumers that key off `agent_risk` should rank findings by
relative ordering rather than absolute thresholds.

## Where to read the scores

- `crimes scan --format json` — `findings[].scores` carries all five
  fields on every finding.
- `crimes scan` (human format) — a one-line "Risk profile" block prints
  alongside any finding where at least one of `churn` / `test_gap` /
  `blast_radius` is > 0.5. `--all` always shows it.
- `crimes explain <id>` — a "Risk profile" section explains each score
  alongside its raw evidence (commit count, importer count, test-file
  presence).
- `crimes context <file>` — every finding rendered in the deep-dive
  view includes the risk profile.
