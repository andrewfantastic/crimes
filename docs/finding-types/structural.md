# Structural findings

Structural crimes flag file- and function-shaped code smells: bodies
that are too long, too many TODOs, or testability issues that come
from reaching for environment-coupled primitives in domain code.
They're the oldest detector category — `crimes@0.1.0` shipped the
first four — and the most fixture-tuned.

For the wire format, see [`docs/json-schema.md`](../json-schema.md).
For the agent workflow that consumes findings, see
[`docs/agent-usage.md`](../agent-usage.md).

## What ships

| `Finding.type`     | Charge              | Severity range | Confidence |
| ------------------ | ------------------- | -------------- | ---------- |
| `large_function`   | God Function        | low-high       | 0.80-0.95  |
| `large_file`       | God File            | medium-high    | 0.80-0.90  |
| `todo_density`     | TODO Tombstone      | low-medium     | 0.75-0.85  |
| `direct_date`      | Temporal Recklessness | medium       | 0.80       |
| `timezone_unsafe_parse` | Timezone Roulette | medium-high  | 0.90       |

All five emit the standard `Finding` shape. No schema bump is required.

---

## God Function (`large_function`)

**What it detects.** Functions whose body exceeds a per-shape line
threshold. The detector classifies each function into one of six
shapes and applies a tailored budget per shape, so a 240-line
`describe()` callback isn't charged at the same threshold as a
240-line domain function.

| Shape                   | Threshold | Severity at threshold | Severity at 2× |
| ----------------------- | --------- | --------------------- | -------------- |
| `domain`                | config (default 60) | medium | high |
| `route_handler`         | 100       | medium                | high           |
| `react_component`       | 200       | medium                | high           |
| `page_export`           | 200       | medium                | high           |
| `test_callback`         | 200       | low                   | medium         |
| `cli_command_registrar` | 200       | low                   | medium         |
| `unknown`               | 80        | medium                | high           |

The `cli_command_registrar` shape (new in 0.6.0) recognises
Commander-style `register*Command(program)` wrapper functions and the
anonymous arrows passed to their `.action(...)` calls. The chain is
declarative DSL, not branching logic, so a long body there shouldn't
read like a domain god-function.

**Example evidence.**

```text
lines 24–286 (263 lines)
3.2× the React component threshold (200 lines)
function declaration
shape: React component (PascalCase name "PricingPage"; body returns JSX)
```

**Why it matters.** Bodies past the shape's threshold usually mix
multiple responsibilities. An agent editing one section misses
interactions in another, and the function becomes a magnet for
further duplication. Smaller, named helpers give every editor — human
or AI — a smaller surface to reason about per edit.

**Suggested fix.** The `suggested_actions[0].description` is tailored
to the shape: extract markup sections for React components, extract
request parsing / authorisation / persistence for route handlers,
move the action body into a named function for CLI registrars, etc.

**Configuration knobs.** `thresholds.largeFunctionLines` (legacy
domain threshold, kept for back-compat) and the per-shape
`thresholds.largeFunction.<shape>` overrides. See
[`docs/configuration.md`](../configuration.md).

---

## God File (`large_file`)

**What it detects.** Source files past a per-shape line threshold.
Counts non-empty lines so generated whitespace can't lower the count.

| Shape       | Threshold              | Severity at threshold | Severity at 2× |
| ----------- | ---------------------- | --------------------- | -------------- |
| `domain`    | config (default 300)   | medium                | high           |
| `test_file` | 1500                   | low                   | medium         |

The `test_file` shape (new in 0.6.0) matches `**/*.{test,spec}.[jt]sx?`
and files under `__tests__/`. Tests legitimately grow large with many
small `it()` blocks, so the budget is much higher and severity caps
at `low` / `medium`.

**Example evidence.**

```text
523 non-empty lines
1.7× the configured 300-line file threshold
22 top-level functions declared in this file
```

**Why it matters.** Files this size accumulate unrelated
responsibilities and become harder to navigate by name. Splitting
them by concern lets agents and reviewers reason about each piece in
isolation.

**Suggested fix.** Identify cohesive groups of functions (data
access, formatting, validation, transport) and extract each into its
own file. Re-exporting from a barrel is fine if the consumers prefer
the flat import. For `test_file` shape, split into per-feature or
per-scenario suites.

**Configuration knobs.** `thresholds.largeFileLines` (legacy domain
threshold, kept for back-compat) and the per-shape
`thresholds.largeFile.<shape>` overrides. See
[`docs/configuration.md`](../configuration.md).

---

## TODO Tombstone (`todo_density`)

**What it detects.** Files where the count of `TODO` / `FIXME` /
`XXX` / `HACK` markers per 1k non-empty lines crosses
`thresholds.todoDensityPerKLoc` (default 10).

**Example evidence.**

```text
8 markers in 420 LOC (19.0 per 1k LOC)
worst lines: 33, 47, 88, 102, 178
```

**Why it matters.** High marker density is a *map of the unowned
work in the file*. Without context, an agent can't tell whether each
TODO is "fix this before merging" or "we accepted this years ago" —
so it either treats everything as urgent or learns to ignore the
marker entirely. Reducing density forces the team to either resolve
or stop pretending the TODO is meaningful.

**Suggested fix.** Convert load-bearing TODOs into tracker tickets
referenced by id. Delete or close the rest. The detector doesn't
care about marker style — `// TODO(@alex)` survives unchanged.

**Self-reference exemption (new in 0.6.0).** A file whose own source
contains the literal token sequence `TODO|FIXME|XXX|HACK` (i.e., it
*defines* the marker pattern rather than carrying markers) is
skipped. This stops the detector from flagging its own source and
any fixture or test of the marker pattern. Prose that just mentions
one marker name in passing is unaffected.

---

## Temporal Recklessness (`direct_date`)

**What it detects.** Domain code that reaches directly for
`Date.now()` or `new Date()` rather than accepting an injectable
clock. Files matching the test glob (`*.test.ts`, `*.spec.ts`,
`__tests__/**`) are exempt — explicit test-time injection is the
fix, not the smell.

**Example evidence.**

```text
3 direct uses of `Date.now()` / `new Date()`
lines: 18 (new Date), 47 (Date.now), 102 (new Date)
file lives in domain path (no test-file shape)
```

**Why it matters.** A domain function that reads "now" from the
process is untestable without monkeypatching, runs differently in
prod vs CI, and silently fails timezone tests. Pass a clock — an
`Injectable<() => Date>` or just a `now()` parameter — and the
finding goes away.

**Suggested fix.** Replace the direct call with a parameter on the
nearest call boundary (`now()`, `clock`, etc.). Inject the real clock
from the entry point and a fixed timestamp from tests.

---

## Timezone Roulette (`timezone_unsafe_parse`)

**What it detects.** `new Date("…")` calls whose string argument has
no timezone marker — no trailing `Z`, no `±HH:MM` offset, no
`GMT±NNNN` segment. The detector skips literals that don't look
date-like (no 4-digit year + separator), epoch numbers, multi-arg
forms, and dynamic expressions. Test files are exempt — fixtures
routinely pin literal dates.

**Example evidence.**

```text
unsafe literals: "2026-12-25T07:00:00", "2027-01-01", "2027-06-15T14:30:00", …
lines: 29, 33, 41
add `Z` for UTC, `±HH:MM` for an offset, or parse through a timezone-aware library
```

**Why it matters.** JavaScript parses date strings differently
depending on their shape:

- `"2026-12-25"` (date-only, ISO 8601 calendar date) → **UTC**
  midnight per the ES spec. The developer often expects local
  midnight.
- `"2026-12-25T07:00:00"` (datetime with no zone) → **local** time.
  The developer often expects UTC.
- `"2026-12-25T07:00:00Z"` → **UTC**, explicit. No ambiguity.
- `"2026-12-25T07:00:00+05:30"` → that offset, explicit.

Coding agents are especially prone to this — they copy a literal
that worked in one environment and silently break in another. Adding
`Z` or an explicit offset removes the guess.

**Severity ramp.** Default `medium`; escalates to `high` when one
file accrues 5 or more unsafe literals (a systemic pattern, not an
accident). Confidence is `0.90` — the pattern is unambiguous when
the string survives the date-like filter.

**Suggested fix.** Append `Z` for UTC, an explicit `±HH:MM` offset,
or switch to a timezone-aware library (Luxon, Temporal API,
date-fns-tz).

**Exemptions.** For configuration-style literals that legitimately
represent "whatever the host's local zone is", add the exact literal
to `detectors.options.timezone_unsafe_parse.allowedLiterals` in
`crimes.config.json`:

```jsonc
{
  "detectors": {
    "options": {
      "timezone_unsafe_parse": {
        "allowedLiterals": ["2026-12-25T07:00:00"]
      }
    }
  }
}
```

The option is validated at config-load time — unknown keys or
wrong-shape values fail fast with `ConfigParseError` (exit `2`).
For a one-off exception, prefer `crimes ignore <fingerprint>`
with a reason instead.
