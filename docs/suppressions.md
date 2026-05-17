# Suppressions

`.crimes/suppressions.json` carries per-finding exceptions the team
has deliberately decided to live with. Suppressed findings are
filtered out of every report by default; the gate (`--fail-on`) never
trips on them. The file is intended to be **committed** and reviewed
in PRs — every entry requires a `reason`.

## When to use a suppression vs the alternatives

| Situation | Right answer |
| --------- | ------------ |
| A specific finding is acceptable in this one place. | `crimes ignore <fingerprint> --reason "…"` |
| You're migrating to `crimes` and don't want to fix everything first. | `crimes baseline save` — see [`ci.md`](./ci.md). |
| A detector fundamentally doesn't fit the repo. | `detectors.disable` in [`configuration.md`](./configuration.md). |
| A threshold is wrong for the repo. | `thresholds.*` in [`configuration.md`](./configuration.md). |
| You want to silence the entire codebase. | Don't. Choose one of the above. |

## Suppress one finding

```bash
crimes explain large_function::src/billing.ts::generateInvoice
# → reads the rationale, decides this is acceptable

crimes ignore large_function::src/billing.ts::generateInvoice \
  --reason "Legacy billing module — rewrite tracked in #1234."
```

Or starting from a per-scan id:

```bash
crimes scan -f json > scan.json
# → spot crime_00005 in the output
crimes ignore crime_00005 --reason "…"
```

`crimes ignore` always persists by **fingerprint**, never by id. Ids
are reassigned every scan; the fingerprint
(`<type>::<file>::<symbol>`) is stable across scans.

`--reason` is required and non-empty. The CLI refuses to write
without one.

### Other flags

- `--file <path>` — override `.crimes/suppressions.json`.
- `--dry-run` — print the entry that would be written and exit.
- `--no-verify` — skip the fresh scan that confirms the fingerprint
  matches a real finding. Useful for pre-emptively suppressing a
  finding the detector hasn't seen yet (rare).

## File shape

```json
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
    }
  ]
}
```

See [`json-schema.md`](./json-schema.md#suppressions-on-disk-shape-of-crimessuppressionsjson)
for the field-by-field reference.

`created_by` is filled in from `git config user.email` when available;
omit it if your repo doesn't carry one. The denormalised `type` /
`file` / `symbol` fields are redundant for matching (only
`fingerprint` drives it) but are load-bearing for human review — a
reviewer scanning `git diff .crimes/suppressions.json` can read the
entry without parsing the fingerprint.

## Removing a suppression

There is no `crimes unignore` yet. Edit `.crimes/suppressions.json`
by hand and delete the entry. The file is hand-reviewable by design.

## Reviewing suppressions

The file is intended to be **committed**. Reviewers should:

1. **Read the reason.** "TODO" or "too noisy" usually means the
   suppression is wrong — either fix the code or tune the detector.
2. **Verify the fingerprint maps to a real, ongoing exception.** The
   denormalised `file` / `symbol` are there for this — you should
   recognise what is being suppressed without grepping the codebase.
3. **Check the count.** A growing `.crimes/suppressions.json` is a
   smell. `git log -p .crimes/suppressions.json` shows the trend.

`crimes scan` prints `N findings suppressed; run with
--show-suppressed to see.` when ≥1 entry matched. Use
`--show-suppressed` to re-surface them annotated.

## Suppressions and CI gates

Suppressions are applied **before** every `--fail-on` evaluation. A
suppressed finding never trips:

- `crimes scan --changed --fail-on <severity>`
- `crimes baseline check --fail-on <severity>`
- `crimes diff --fail-on new-high | new-medium`
- `crimes verdict --fail-on worse | new-high | new-medium`

The gate semantics are independent of `--show-suppressed`: an entry
that surfaces in the output as annotated is still excluded from the
threshold check.

## Suppressions vs baselines

| `.crimes/baseline.json` | `.crimes/suppressions.json` |
| ----------------------- | --------------------------- |
| Repo-wide snapshot of pre-existing findings. | Per-finding deliberate exception with a reason. |
| Forward-only — new findings are blocked. | Permanent — entries persist until you delete them. |
| Written by `crimes baseline save`. | Written by `crimes ignore`. |
| Read by `crimes baseline check`. | Read by every report-producing command. |
| Use when adopting `crimes` for the first time. | Use when one specific finding is acceptable. |

Most teams want both: `baseline` to ignore legacy debt, `suppressions`
to document the specific findings the team has triaged.

## Anti-patterns

- **"Too noisy" as the reason.** If your reason is "too noisy", the
  suppression is probably wrong. Tune the detector via config (per-shape
  thresholds, disable on a research repo) or fix the code.
- **Whole-codebase suppressions.** There is no glob support on purpose
  — the on-disk-as-review-artefact discipline only works when every
  entry maps to one specific finding.
- **Stale suppressions.** Renaming a file changes the fingerprint and
  silently breaks the suppression. That is a feature, not a bug — the
  renamed file deserves a fresh review.
