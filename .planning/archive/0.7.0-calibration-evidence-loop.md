# `crimes@0.7.0` — Calibration & Evidence Loop

> Plan for the release that follows `crimes@0.6.0` (the detector +
> scoring completion release). This is **not a feature release** — it
> ships zero new detectors and one new command (`crimes feedback`).
> Every change is justified by data the release itself generates.

## 0. TL;DR

`crimes@0.7.0` is the **calibration release**. After 0.6.0 added 18
new detectors in one batch, we need real-world signal before adding
more. This release builds the two feedback mechanisms that turn
"crimes runs on a codebase" into "crimes gets *better* every time it
runs on a codebase":

- **Track A — Dogfood feedback loop.** A `crimes feedback`
  subcommand that captures Andrew's judgment (`tp` / `fp` / `known`)
  on every finding across his multi-project workflow. `fp` verdicts
  auto-suppress with the note as the reason, AND
  auto-resurface on each minor-version bump so we re-collect
  feedback against the new tuning. The suppression+resurface loop is
  load-bearing — without it, calibration data dries up after the
  first release.
- **Track B — Agentic eval harness.** A reproducible test bench of
  8-10 fixtures × ~5 scenarios × Claude + Codex, structurally
  auto-scored, with an opt-in judge-model pass for open-ended
  judgments. Runs locally on Andrew's machine via the `claude` and
  `codex` CLIs in non-interactive mode — both authenticate against
  his existing subscriptions, so no API keys, no per-call billing,
  no cost ceilings. Eval-per-release rather than weekly cadence:
  Prompt M of each milestone runs the full eval and commits the
  new pinned results. PR-time CI diff replays already-committed
  results without invoking agents.

Plus housekeeping the §20 dogfood appendix flagged but 0.6.0 didn't
ship: `direct_date` test-file exemption, the 0.6.0 post-release
noise baseline (Appendix B), and splitting the two legitimately-
large files (`reporter/src/human.ts` 826L,
`language-js/src/parse.ts` 943L) we noted but kept.

Schema-wise: `schema_version` stays at `"0.1.0"`. Everything new is
optional and additive. The only new command is `crimes feedback`.

---

## 1. Product framing

### Why calibration is the right 0.7.0

0.6.0 was a kitchen-sink release — 18 new detector types, four
shared-infrastructure modules, the M5 docs site. The 0.5.0
dogfood appendix (§20 of `DETECTOR_SCORING_COMPLETION_PLAN.md`)
already showed that more detectors without calibration data leads to
the well-known "linter noise" failure mode: teams disable the tool
because the false-positive ratio crosses some patience threshold.

The 0.6.0 release notes explicitly position 0.7.0 as the response:

> 0.7.0 is the structured Claude + Codex testing + evidence-hook
> milestone. The 0.5.0 dogfood appendix becomes a regression test:
> re-run the self-scan after 0.6.0 lands, compare per-detector
> signal-vs-noise, and feed the comparison into severity /
> confidence / threshold tuning for 0.8.0+. No new product surface;
> the work is empirical.

This plan honours that framing. **No new detectors. No new commands
beyond `crimes feedback`. No new schema major.** Every line of code
either captures evidence or acts on existing evidence.

### What "no new product surface" trades

It trades the dopamine of shipping new detectors for the longer-arc
payoff of detectors that actually fire correctly. The 0.5.0
appendix is one data point; without a sustained collection
mechanism, the 0.6.0 release is the same situation. We need a flow
where every scan Andrew runs across his projects is a calibration
event, and a harness where scripted Claude + Codex runs catch the
detector-quality regressions that human dogfooding alone misses.

### Why the auto-resurface mechanism is load-bearing

A naive `crimes feedback --verdict fp` that just suppresses the
finding creates a dead-letter office: the false-positive never
surfaces again, so the user never gets to re-confirm whether the
*next* release's tuning fixed it. The whole calibration loop dies
on the first minor release after each suppression.

The fix: every feedback-sourced suppression is pinned to the minor
crimes version that produced it. On each scan with a newer crimes
minor, those suppressions **resurface** (annotated as
`previously_suppressed: true`) so Andrew re-confirms `fp` (push
the pin forward by one minor) or marks `tp` (delete the
suppression — the new tuning fixed it). The `tp`-after-`fp`
trajectory is the highest-value training data we collect: "we used
to be wrong, now we're right." The `fp`-after-`fp` trajectory tells
us a detector still hasn't been fixed and is a candidate for
threshold adjustment in 0.8.0+.

Without this loop, 0.7.0's feedback story is broken-by-design.

### Why two parallel tracks

Track A (dogfood loop) and Track B (eval harness) feed the same
goal — better signal-to-noise — but have very different shapes:

- **A is opportunistic, human-driven, real-world.** It captures what
  Andrew actually sees while working on his other projects. The
  capture surface needs to be frictionless or it won't happen.
- **B is scripted, agent-driven, reproducible.** It catches
  regressions between releases by running the same fixture ×
  scenario × agent combinations against each new crimes version.

Each alone is incomplete. A alone gives us one expert opinion on
some unknown distribution of code. B alone gives us synthetic
results from agents that don't necessarily behave like Andrew. Both
together give us a calibrated signal across the cartesian product
of (real code × expert judgment × agent behaviour).

The two tracks ship in parallel within 0.7.0 because they are
independent — no track B prompt depends on a track A prompt, and
vice versa.

---

## 2. `0.7.0` release goal

`crimes@0.7.0` ships when all of the following are true:

1. **`crimes feedback` is wired and frictionless.** Capturing a
   verdict on a finding takes one CLI invocation. The output of
   `crimes scan` (human format) suggests the exact command line.
2. **The fp ↔ suppression auto-resurface loop works.** A finding
   marked `fp` in 0.7.0 is silenced for 0.7.x scans, then
   automatically resurfaces on the first 0.8.x scan so Andrew can
   re-confirm.
3. **The 0.6.0 noise baseline is captured.** Appendix B of this
   plan is filled in with the full `crimes scan packages docs`
   output against `main` at the v0.7.0 release SHA.
4. **The eval harness is checked in and reproducible.** `pnpm run
   evals` succeeds against all 8-10 fixtures × 5 scenarios × Claude
   + Codex, producing pinned results in
   `evals/results/<version>/`.
5. **Weekly CI cron is running.** The cron writes structural-only
   eval results to the repo + emits a summary.
6. **Both legit large files are split.** `reporter/src/human.ts`
   and `language-js/src/parse.ts` are below the God File threshold
   without behavioural change.
7. **`direct_date` no longer flags test files.** The §20 false
   positive is closed.
8. **Docs and website ship the feedback story.** `docs/feedback.md`
   exists, `crimes.sh/docs/feedback/` renders, the hero pill bumps
   to 0.7.0.

### What this trades

- **No new detectors.** Teams asking "when do you detect X?" wait
  until 0.8.0. The 0.6.0 slate is what they get.
- **No Python.** Open question in PRD §26, deferred again.
- **No LLM-assisted detection.** Evals call LLMs; detectors stay
  deterministic. This is a wedge protection.
- **No hosted feedback collector.** All feedback stays local on
  Andrew's machine. A future release may add opt-in upload; 0.7.0
  doesn't.

---

## 3. Recommended scope

### Must ship

The minimum bar for the release. Drop any of these and the
calibration loop is half-built.

1. **`crimes feedback` CLI** (§4.1): `write`, `list`, `summary`,
   `export`, `recheck` subcommands.
2. **Feedback storage** (§4.2): `.crimes/feedback.jsonl` per repo
   and `~/.crimes/feedback-rollup.jsonl` global rollup populated
   via `crimes feedback export --append-global`.
3. **fp ↔ suppression integration + auto-resurface** (§4.3): the
   load-bearing loop.
4. **Reporter inline hints** (§4.5): every human-format finding
   suggests its feedback command.
5. **`direct_date` test-file exemption** (§6.1).
6. **0.6.0 noise baseline** (§6.2, Appendix B).
7. **Eval harness scaffold** (§5.1): directory, scenario schema,
   runner skeleton.
8. **Fixture corpus** (§5.2): 8-10 named fixtures.
9. **Scenario library** (§5.3): ~5 scenarios per fixture.
10. **Auto-scoring rubric** (§5.5): structural assertions.
11. **PR-time eval diff CI workflow** (§5.7): replays cached
    results against the new crimes version on PRs that touch
    detector / scoring code. No fresh agent calls.
12. **Split `reporter/src/human.ts`** (§6.3).
13. **Split `language-js/src/parse.ts`** (§6.4).
14. **Docs + release notes** (§10).

### Should ship

Worth doing in 0.7.0 if scope allows. Higher leverage than further
fixture variety but smaller surface than a must-ship.

15. **Judge-model pass** (§5.6): `pnpm run evals -- --judge` opt-in
    local. Uses the same `claude` CLI as the agent runs (judge is
    Claude in a different role). No CI invocation.
16. **`pnpm run evals:replay`** — runs the structural rubric over
    already-committed result files against the current crimes
    binary. Used by the PR-diff workflow and by Andrew for
    "what changed?" runs without re-invoking agents.

### Could ship

If time allows. None block the release.

17. **`crimes feedback recheck` interactive mode.** Walks Andrew
    through each resurfaced finding one at a time, accepting
    `t`/`f`/`s` keystrokes for tp/fp/skip. Saves keystrokes when
    there are 20+ resurfaced findings.
18. **Result publishing to website.** `crimes.sh/evals/` page
    auto-generated from `evals/results/<version>/` showing
    per-version per-agent scoring trends.

### Defer (out of scope for 0.7.0)

- **All new detectors.** Period. The 0.6.0 slate is what we tune.
- **New CLI commands beyond `crimes feedback`.**
- **Python language pack.** PRD §26 question. Revisit after 0.8.0.
- **Hosted feedback collector.** Wedge protection.
- **Custom matchers / severity overrides in config.** Deferred from
  0.5.0; still deferred.
- **Feedback expiry (`expires_at` on entries).** The minor-version
  resurface mechanism replaces it.
- **LLM-assisted detector modes.** Wedge protection.

**Conservative shape:** must-ship items 1-14 land. Should-ship
items 15-16 land if any prompt has spare scope. Could-ship items
defer to 0.8.0.

---

## 4. Track A — Dogfood feedback loop

The shared infrastructure for Track A lives in
`packages/core/src/feedback/` and `packages/cli/src/commands/`.
The CLI is a thin orchestration layer over a core API; both share
the same storage schema.

### 4.1 `crimes feedback` CLI surface

One subcommand, five verbs:

```bash
# Capture a verdict (most common path)
crimes feedback <fingerprint-or-id> --verdict {tp|fp|known} --note '<reason>' [--file <scan.json>]

# Read your feedback back
crimes feedback list [--repo .|--global] [--since 30d] [--verdict fp]
crimes feedback summary [--repo .|--global]

# Cross-project rollup (for andrew running crimes on N projects)
crimes feedback export [--append-global] [--format jsonl|md]

# Per-release review (the "what got resurfaced?" view)
crimes feedback recheck [--detector <type>] [--severity {low|medium|high}]
```

**Verdict semantics:**

- `tp` — "true positive, the finding caught a real issue." Closes
  any prior `fp` feedback on the same fingerprint; deletes any
  matching feedback-sourced suppression.
- `fp` — "false positive, the detector got this wrong." Writes a
  feedback entry AND auto-creates a feedback-sourced suppression
  (see §4.3). The `--note` is required (the suppression needs a
  reason).
- `known` — "I know about this, leaving it for now." Records the
  judgment but does NOT suppress. Useful when you want to track
  awareness without silencing.

**`<fingerprint-or-id>` argument:**

Accepts either:
- A per-scan id (`crime_00005`) — only valid with `--file <scan.json>`
  because per-scan ids are ephemeral.
- A stable fingerprint (`<type>::<file>::<symbol>`) — works
  standalone; same identity `crimes diff` / `crimes baseline` /
  `crimes ignore` use.

**`--file <scan.json>` flag:**

When passed, the command reads the scan JSON to resolve `crime_XXXXX`
ids to fingerprints AND to populate the `scan_hash` field on the
feedback entry (sha256 of the scan JSON). Without `--file`, the
command requires a fingerprint and writes the entry with
`scan_hash: null`.

**`--repo .|--global`:**

- Default `.`: read from `./.crimes/feedback.jsonl`.
- `--global`: read from `~/.crimes/feedback-rollup.jsonl`.

**`crimes feedback recheck`** is the per-release review surface.
It scans for suppressions where `source: "feedback"` AND
`crimes_version_pinned` minor != current crimes minor, and prints
them one at a time with the exact re-feedback command. Output is
designed for fast triage:

```
3 findings previously marked fp (resurface from 0.6 → 0.7):

[1/3] large_function — packages/cli/src/commands/ignore.ts:registerIgnoreCommand (171 lines)
      Marked fp in 0.6: "Commander DSL chain — not mixed responsibilities"
      In 0.7: detector behaviour unchanged. Re-confirm or mark resolved.
        Re-confirm fp: crimes feedback large_function::packages/cli/src/commands/ignore.ts::registerIgnoreCommand --verdict fp
        Mark resolved: crimes feedback large_function::packages/cli/src/commands/ignore.ts::registerIgnoreCommand --verdict tp

[2/3] direct_date — packages/core/src/suppressions.test.ts:(file-level) (10 uses)
      Marked fp in 0.6: "Test-file injection — intentional"
      In 0.7: direct_date now skips test files. Likely resolved.
        Mark resolved: crimes feedback direct_date::packages/core/src/suppressions.test.ts:: --verdict tp

[3/3] ...
```

The "In 0.7: ..." hint is generated from a per-detector
release-notes map (see §4.4).

### 4.2 Feedback storage schema

Two files, both JSON-Lines for append-friendliness:

**Per-repo: `.crimes/feedback.jsonl`** (committed to the repo;
co-resident with `.crimes/baseline.json` and
`.crimes/suppressions.json`).

```jsonl
{"timestamp":"2026-05-20T12:00:00Z","crimes_version":"0.7.0","fingerprint":"large_function::packages/cli/src/commands/ignore.ts::registerIgnoreCommand","finding_type":"large_function","verdict":"fp","note":"Commander DSL chain — not mixed responsibilities","scan_hash":"sha256:abc123..."}
{"timestamp":"2026-05-20T12:01:30Z","crimes_version":"0.7.0","fingerprint":"direct_date::packages/core/src/suppressions.test.ts::","finding_type":"direct_date","verdict":"fp","note":"Test-file injection — intentional","scan_hash":"sha256:abc123..."}
```

**Global rollup: `~/.crimes/feedback-rollup.jsonl`** (per-machine;
populated by `crimes feedback export --append-global` per repo).
Same shape plus a `repo` field:

```jsonl
{"timestamp":"2026-05-20T12:00:00Z","crimes_version":"0.7.0","repo":"/Users/andrew/dev/crimes","fingerprint":"large_function::packages/cli/src/commands/ignore.ts::registerIgnoreCommand", ...}
{"timestamp":"2026-05-21T08:15:00Z","crimes_version":"0.7.0","repo":"/Users/andrew/dev/some-other-project","fingerprint":"react_component::src/Dashboard.tsx::Dashboard", ...}
```

**Field reference (`FeedbackEntry`):**

| Field | Type | Notes |
|-------|------|-------|
| `timestamp` | ISO 8601 | When the verdict was recorded |
| `crimes_version` | string | Full semver (`"0.7.0"`) — the version that produced the finding |
| `fingerprint` | string | Stable across scans; primary key |
| `finding_type` | string | Convenience denormalisation (one of the known detector ids) |
| `verdict` | `"tp"\|"fp"\|"known"` | The judgment |
| `note` | string \| null | Required when verdict is `fp` (it becomes the suppression reason) |
| `scan_hash` | string \| null | sha256 of the scan JSON if `--file` was used |
| `resurfaced_from` | string \| null | Set when this entry re-confirms a prior `fp` from a different minor (e.g. `"0.6"`) |
| `repo` | string | Only present in the global rollup |

**Append semantics:** every call writes a new line. Re-feedback on
the same fingerprint does NOT modify prior entries; it appends a
new one. Read-side commands (`list`, `summary`, `recheck`) walk
backwards from EOF and use the latest entry per fingerprint as the
current verdict. This keeps the file append-only and preserves
history (useful for "how did my judgment evolve?" analysis).

**Why JSONL and not JSON:** append-friendly, line-grep-friendly,
naturally version-controlled (PRs show one line per new feedback
event). Same rationale as `.crimes/baseline.json`'s array-of-objects
shape; JSONL is the streaming equivalent.

### 4.3 fp ↔ suppression integration + auto-resurface

The mechanism in one diagram:

```
crimes feedback X --verdict fp --note "Y"
  │
  ├─→ .crimes/feedback.jsonl  (always: append entry)
  └─→ .crimes/suppressions.json  (auto: write/update suppression)
          ├─ fingerprint: X
          ├─ reason: "Y"
          ├─ source: "feedback"        ← NEW field (0.7.0)
          └─ crimes_version_pinned: "0.7"   ← NEW field (0.7.0)

Next scan with crimes minor === 0.7:
  finding X is suppressed (silently dropped, suppressed_count +1)

Next scan with crimes minor === 0.8:
  finding X is RESURFACED (kept in findings array) with:
    previously_suppressed: true
    previous_suppression: {pinned_version: "0.7", reason: "Y"}
  Human output adds inline hint: "this was marked fp in 0.7"
```

**Suppression-file schema additions** (back-compat — `source`
defaults to `"manual"` when absent, which is exactly how the 0.5.0
file behaves):

```ts
interface Suppression {
  fingerprint: string;
  reason: string;
  created_at: string;  // ISO 8601
  source?: "manual" | "feedback";       // NEW in 0.7.0 — default "manual"
  crimes_version_pinned?: string;       // NEW in 0.7.0 — only when source === "feedback"
}
```

**Resurface logic** (applied during `applySuppressions` in
`packages/core/src/suppressions.ts`):

```ts
function shouldResurface(s: Suppression, currentVersion: string): boolean {
  if (s.source !== "feedback") return false;       // manual suppressions never resurface
  if (!s.crimes_version_pinned) return false;      // malformed entry, treat as quiet
  return minorOf(s.crimes_version_pinned) !== minorOf(currentVersion);
}
```

Resurfaced findings are kept in `findings[]`, NOT counted in
`suppressed_count`, and tagged `previously_suppressed: true`.

**Re-feedback on a resurfaced finding:**

- `--verdict fp`: rewrite the suppression's `crimes_version_pinned`
  to the current minor. Append a feedback entry with
  `resurfaced_from: "<previous-minor>"`. The finding is silent
  again for one more release.
- `--verdict tp`: delete the suppression entirely. Append a
  feedback entry with `resurfaced_from: "<previous-minor>"` and
  `verdict: "tp"`. The finding will surface normally on every
  future scan; we have evidence the tuning improved.
- `--verdict known`: keep the suppression but DON'T update its
  pinned version (it'll resurface again on the next minor). This
  is "I'm aware, ask me again later."

**Why minor-version granularity (not patch):**

Patch releases (0.7.0 → 0.7.1) are bug fixes — detector behaviour
shouldn't change meaningfully. Resurfacing on every patch would be
annoying without signal. Minor releases (0.7.0 → 0.8.0) are where
detector tuning lives, so resurfacing aligns with the "did the new
tuning fix this?" question. Major releases (0.X → 1.X) are TBD;
right now major-version bumps imply schema breakage anyway.

**Edge cases:**

- **`crimes_version_pinned` is "0.7" but current is "0.7.5":** same
  minor, don't resurface.
- **`crimes_version_pinned` is "0.7" but current is "0.6.5":** the
  suppression is from the *future* (you downgraded crimes). Don't
  resurface; treat as quiet. Log a one-line stderr warning.
- **The fingerprint no longer matches any finding:** the suppression
  is stale (the file moved or the detector now classifies it
  differently). `crimes audit-suppressions` already flags this; no
  change to that flow.

### 4.4 Per-detector release-notes map for `recheck`

`crimes feedback recheck` prints a "In <current>: <hint>" line per
resurfaced finding. The hint comes from a baked-in map keyed by
(detector_id, target_version):

```ts
// packages/core/src/feedback/release-notes.ts
export const RELEASE_NOTES: Record<string, Record<string, string>> = {
  direct_date: {
    "0.7": "direct_date now skips test files. Likely resolved.",
  },
  large_function: {
    "0.6": "cli_command_registrar shape added — Commander DSL chains get a 200-line budget. Likely resolved for register*Command findings.",
  },
  todo_density: {
    "0.6": "Detector now skips its own source file. Likely resolved if your file defines the regex.",
  },
  // ... add as we know per-version behaviour changes
};
```

When no entry exists for `(detector_id, target_version)`, the
recheck output falls back to: "detector behaviour unchanged.
Re-confirm or mark resolved."

This map ships baked into the binary, not as a separate data file,
so it's always in sync with the code that produced the version.

### 4.5 Reporter integration

Every finding in `--format human` output gets a one-line trailing
hint pointing at the feedback command:

```
crime_00005  HIGH    large_function   packages/cli/src/commands/ignore.ts:59
             God Function — "registerIgnoreCommand" is 171 lines (cli_command_registrar threshold 200).
             ...
             Give feedback: crimes feedback large_function::packages/cli/src/commands/ignore.ts::registerIgnoreCommand --verdict {tp|fp}
```

For resurfaced findings, the hint changes:

```
             ⚠ Previously marked fp in 0.7. Re-confirm: crimes feedback <fp> --verdict {tp|fp}
             ↳ See `crimes feedback recheck` to walk all resurfaced findings.
```

**Suppression rules** (same as the 0.6.0 stderr breadcrumb):

- Suppressed when stdout is piped (`!process.stdout.isTTY`).
- Suppressed when `--no-color` is set.
- Suppressed when `--format json` is selected (JSON output never
  contains free-form hints; the `Finding.previously_suppressed`
  flag is the structured equivalent).

The hint adds ~80 characters per finding to human output. Findings
typically span 8-15 lines; one more is a rounding error.

### 4.6 Rollup + export + summary

**`crimes feedback export`:**

- Without flags: prints the local `.crimes/feedback.jsonl` to
  stdout. Useful for piping into other tools.
- `--append-global`: appends every entry to
  `~/.crimes/feedback-rollup.jsonl`, deduplicating by
  `(repo, timestamp, fingerprint)`. Safe to run multiple times.
- `--format md`: pretty-prints as a Markdown report (grouped by
  detector, with counts). For paste-into-notes use.

**`crimes feedback summary`:**

Aggregates entries into a quick-read table:

```
Repo: /Users/andrew/dev/crimes  (.crimes/feedback.jsonl: 47 entries)

By verdict:
  tp:    18 (38%)
  fp:    23 (49%)
  known:  6 (13%)

By detector (fp count, top 5):
  large_function           9 fp   "Commander DSL chains" (most common note)
  direct_date              4 fp   "Test-file injection"
  todo_density             3 fp   "Detector source itself"
  parallel_destination     3 fp   "Different route trees"
  duplicate_component_shape 2 fp   "Tailwind variant pattern"

By crimes version:
  0.7.0:  31 entries
  0.6.0:  16 entries
```

With `--global`, the same table runs against the rollup file and
gains a `By repo` section.

`--format json` for both `export` and `summary` produces a
`FeedbackReport` shape (see §7).

---

## 5. Track B — Agentic eval harness

The eval harness lives in `evals/` at the repo root, as a sibling
of `apps/`, `packages/`, and `examples/`. It is **not** a published
package — it's a contributor surface for calibration work.

### 5.1 Directory layout

```
evals/
  fixtures/
    01-messy-ts-app/         (symlinked from examples/messy-ts-app)
    02-react-dashboard/      (cloned at pinned SHA, .gitignored body)
    03-node-cli-tool/        (cloned at pinned SHA, .gitignored body)
    04-monorepo/             (cloned at pinned SHA, .gitignored body)
    05-stress-ia-drift/      (hand-crafted, committed)
    06-stress-duplication/   (hand-crafted, committed)
    07-stress-frontend/      (hand-crafted, committed)
    08-stress-dependency/    (hand-crafted, committed)
    09-clean-tiny/           (hand-crafted, committed)
    10-clean-typed/          (hand-crafted, committed)
    fixtures.meta.json       (registry: name, kind, source, pinned SHA)
  scenarios/
    refactor.json            (per-fixture: target file + expected behaviour)
    bugfix.json
    review.json
    context.json
    plan.json
  results/
    0.7.0/
      claude/refactor-01-messy-ts-app.json
      claude/refactor-02-react-dashboard.json
      claude/...
      codex/refactor-01-messy-ts-app.json
      codex/...
      summary.json           (rolled-up scoring per agent × scenario)
  runner/
    src/index.ts             (orchestrator: fixture × scenario × agent)
    src/agents/claude.ts     (Claude API invocation)
    src/agents/codex.ts      (Codex CLI invocation)
    src/score.ts             (structural assertions)
    src/judge.ts             (opt-in judge-model pass)
    src/setup.ts             (clone OSS fixtures at pinned SHAs)
    package.json             (workspace package, not published)
  README.md                  (how to run, how to add fixtures/scenarios)
```

**`evals/runner` is a pnpm workspace package** (private, not
published). It depends on `@crimes/cli` for invoking the binary and
on `@anthropic-ai/sdk` for Claude calls. Codex calls shell out to
the `codex` CLI in non-interactive mode.

### 5.2 Fixture corpus

8-10 fixtures organised by purpose. Each fixture is a *complete*
repo (own `package.json`, own `crimes.config.json` if needed) so
`crimes scan` runs against it as if it were a real project.

| # | Name | Kind | Purpose |
|---|------|------|---------|
| 01 | `messy-ts-app` | symlink | Existing fixture; sanity baseline |
| 02 | `react-dashboard` | OSS clone | Exercises frontend detectors (token escape, a11y, responsive) |
| 03 | `node-cli-tool` | OSS clone | Exercises `cli_command_registrar` shape + IA detectors |
| 04 | `monorepo` | OSS clone | Exercises dependency-graph detectors (cycles, layer violations) |
| 05 | `stress-ia-drift` | hand-crafted | Intentional concept aliases, plural/singular drift, command drift |
| 06 | `stress-duplication` | hand-crafted | Exact + near-duplicate blocks, duplicated policy logic |
| 07 | `stress-frontend` | hand-crafted | Token escape, missing aria, fixed widths, responsive fragility |
| 08 | `stress-dependency` | hand-crafted | Layered architecture violations, circular imports, deep imports |
| 09 | `clean-tiny` | hand-crafted | Minimal repo with zero findings (control) |
| 10 | `clean-typed` | hand-crafted | Well-tested strict-TS repo with zero findings (stronger control) |

**OSS clones** are pinned at specific SHAs and NOT committed to the
crimes repo (keeps the tree small). `evals/fixtures/02-react-
dashboard/.crimes-eval-meta.json`:

```json
{
  "upstream": "https://github.com/owner/repo",
  "sha": "abc123def456",
  "license": "MIT",
  "purpose": "Mid-size React app, ~50 components, exercises frontend track"
}
```

`pnpm run evals:setup` reads every `.crimes-eval-meta.json`, clones
each repo at the pinned SHA into the fixture directory, and runs
`pnpm install` per fixture if `package.json` is present. The clone
bodies are gitignored. Re-running is idempotent.

**OSS fixture selection criteria:**

- License compatible (MIT / Apache-2.0 / BSD-style).
- Active enough to be representative but small enough that `crimes
  scan` finishes in seconds, not minutes.
- Pinned to a SHA so upstream rewrites don't break evals.
- Public, so anyone running the eval harness can reproduce results.

Specific candidate repos to evaluate (Andrew to confirm or
substitute): TBD in Prompt I — we'll write a one-page selection
note alongside the meta files.

**Stress fixtures** are committed; they're tiny (a handful of
files each) and designed to exercise one detector category cleanly:

- `05-stress-ia-drift`: a `routes/` tree with 3-4 routes using
  inconsistent plural/singular tokens, a nav file referencing a
  subset, a docs file mentioning a different subset.
- `06-stress-duplication`: a 30-line function copied across 3 files
  with renamed identifiers + a 30-line function copied identically
  twice + three `if (role === "admin")` checks.
- `07-stress-frontend`: a React component with hex literals
  alongside a `tailwind.config.ts`, a `<div onClick>` without role,
  a `style={{width: 800}}` block.
- `08-stress-dependency`: a 4-layer architecture
  (presentation/application/domain/infrastructure) with one rule
  violation per layer + a 3-file import cycle + a deep import.

**Control fixtures** (09 + 10) ensure crimes doesn't hallucinate
findings. A scenario run on `09-clean-tiny` that produces non-empty
findings is a regression bug.

### 5.3 Scenario schema

```ts
interface Scenario {
  id: string;                            // "refactor-01-messy-ts-app"
  fixture: string;                       // "01-messy-ts-app"
  kind: "refactor" | "bugfix" | "review" | "context" | "plan";
  prompt: string;                        // full agent prompt, multi-line
  expected_artifacts: {
    referenced_findings?: string[];      // finding-types the agent should mention
    referenced_files?: string[];         // files the agent should propose editing
    forbidden_actions?: string[];        // things the agent should NOT do
    expected_priority?: string;          // finding-type the agent should prioritise first
  };
  judge_questions?: string[];            // open-ended Qs for the judge-model pass
}
```

**Five canonical scenario kinds:**

1. **`refactor`** — "Reduce risk in this file. Use
   `crimes context <file>` to understand the surface. List the top
   3 things you'd change, with reasoning tied to specific
   findings."
2. **`bugfix`** — "Test X is failing. Use `crimes scan --changed`
   to see what's risky in the diff. Identify the most likely cause
   and propose a fix."
3. **`review`** — "Review this PR using `crimes diff
   <base>...<head>`. List findings that should block merge vs
   warn vs ignore."
4. **`context`** — "Use `crimes context <file>` to gather context
   before editing. Summarise what the file does, what related files
   you'd also need to read, and what risks the scan flagged."
5. **`plan`** — "Use `crimes scan` + `crimes verdict` to propose a
   triage order for the top 10 findings. Group by detector
   category and risk."

Each fixture gets ~5 scenarios (one per kind, scoped to a specific
file or PR in that fixture). Total: 50-ish scenarios.

**Where scenarios live:** one JSON file per kind, with an array of
scenarios indexed by fixture:

```jsonc
// evals/scenarios/refactor.json
[
  {
    "id": "refactor-01-messy-ts-app",
    "fixture": "01-messy-ts-app",
    "kind": "refactor",
    "prompt": "...",
    "expected_artifacts": {
      "referenced_findings": ["large_function", "direct_date"],
      "referenced_files": ["src/billing.ts"],
      "expected_priority": "large_function"
    },
    "judge_questions": [
      "Did the agent correctly identify generateInvoice as the highest-risk function?",
      "Did the agent's proposed refactor preserve the public API?"
    ]
  },
  // ... one per fixture
]
```

### 5.4 Runner

Single binary, multiple flags:

```bash
pnpm run evals                          # all fixtures × all scenarios × Claude + Codex
pnpm run evals -- --agent claude        # just Claude (skip Codex)
pnpm run evals -- --agent codex         # just Codex (skip Claude)
pnpm run evals -- --fixture 01          # just fixture 01
pnpm run evals -- --scenario refactor   # just refactor scenarios across all fixtures
pnpm run evals -- --judge               # opt-in judge-model pass
pnpm run evals -- --bail                # stop on first failure (debugging)
```

**Per-(fixture, scenario, agent) execution:**

1. **Setup:** `cd evals/fixtures/<NN>-<name>` and run `crimes scan
   -f json > /tmp/eval-<run-id>-scan.json`. The scan output is the
   "context" the agent gets.
2. **Invoke agent:** send the scenario's `prompt` plus the scan
   JSON to the agent. Capture full transcript + final response.
3. **Structural scoring:** parse the agent's response and check
   `expected_artifacts` (see §5.5).
4. **Judge pass (if `--judge`):** send transcript + scenario +
   expected_artifacts + judge_questions to the judge model. Capture
   the structured judge output.
5. **Write result:** to
   `evals/results/<crimes-version>/<agent>/<scenario-id>.json`.

**Agent invocation details (subscription-authenticated, local-only):**

Both agents are invoked by shelling out to the user's locally-installed
CLI tools. Auth is the user's existing subscription session — no API
keys, no per-call billing, no monthly caps to worry about.

- **Claude**: shell out to `claude -p "<prompt>" --output-format json`
  (or whatever the non-interactive single-shot equivalent is at
  release time). Reads `~/.claude/...` subscription credentials.
  Model selection via `--model` flag; default Opus 4.x.
- **Codex**: shell out to `codex exec --json <prompt>` (or
  equivalent). The Codex skill in this repo (`skill-codex:codex`)
  provides the canonical invocation pattern. Reads the user's
  Codex subscription credentials.

The runner detects missing CLIs at startup (`which claude` /
`which codex`) and exits with a clear setup message rather than
attempting to run.

**Determinism:** the CLI tools may or may not expose temperature
controls. Output is non-deterministic across runs regardless (this
is unavoidable), so result files include a `run_id` and the runner
can be called multiple times to estimate variance.

**Why subscription-only and not "fall back to API keys if subs are
absent":** keeping the auth path single-track removes a class of
"works locally, breaks in CI" bugs. If we ever want CI eval runs
later, we'll design that as a separate flag explicitly — for 0.7.0,
the wedge is "Andrew's machine, his subscription."

### 5.5 Auto-scoring rubric

Structural assertions are deterministic and cheap. They run on
every CI cron and every PR replay.

**Per-scenario scoring:**

```ts
interface ScoreResult {
  scenario: string;
  agent: string;
  crimes_version: string;
  timestamp: string;
  run_id: string;
  structural_score: {
    passed: number;
    failed: number;
    details: Array<{
      check: "referenced_findings" | "referenced_files" | "forbidden_actions" | "expected_priority";
      expected: unknown;
      observed: unknown;
      passed: boolean;
    }>;
  };
  judge_score?: {
    overall: number;          // 0-10
    per_question: Array<{question: string; score: number; reasoning: string}>;
    model: string;
  };
}
```

**Check implementations:**

- `referenced_findings`: extract every known detector-id string
  from the agent's response (using the public list of detector ids
  shipped in core). Compare to expected. Score: 1 per match, 0 per
  miss.
- `referenced_files`: extract every file-path-shaped string. Same.
- `forbidden_actions`: regex search for forbidden patterns. Score:
  1 if none present, 0 if any present.
- `expected_priority`: parse the first 200 characters of the
  agent's response for the priority finding-type. Heuristic: the
  first detector-id mentioned wins. Score: 1 if matches, 0
  otherwise.

**Per-version rollup** (`evals/results/<version>/summary.json`):

```json
{
  "crimes_version": "0.7.0",
  "total_scenarios": 50,
  "per_agent": {
    "claude": {"structural_pass_rate": 0.82, "scenarios_run": 50},
    "codex":  {"structural_pass_rate": 0.74, "scenarios_run": 50}
  },
  "per_scenario_kind": {
    "refactor": {"claude": 0.90, "codex": 0.80},
    "bugfix":   {"claude": 0.85, "codex": 0.75},
    "review":   {"claude": 0.80, "codex": 0.70},
    "context":  {"claude": 0.85, "codex": 0.80},
    "plan":     {"claude": 0.70, "codex": 0.65}
  },
  "regressions_vs_prev_version": []
}
```

`regressions_vs_prev_version` flags scenarios where the pass rate
dropped vs the previous crimes version's pinned results. Useful
for catching "detector tuning made agent behaviour worse" bugs.

### 5.6 Judge-model pass (opt-in local)

Default off. Triggered by `--judge`. Sends to the judge model:

```
[SYSTEM]
You are evaluating an AI agent's response to a code-analysis task. You
will be given the scenario, the expected artifacts, the agent's full
response, and a list of judge questions. For each question, respond
with a JSON object: {"score": 0-10, "reasoning": "<one paragraph>"}.

[USER]
SCENARIO: <scenario JSON>
EXPECTED: <expected_artifacts>
AGENT_RESPONSE: <full agent response>

JUDGE_QUESTIONS:
1. <question 1>
2. <question 2>
...

Respond with one JSON object per question, in order.
```

**Default judge model:** Claude via the same `claude -p` CLI used
for agent runs (just in a different role — "evaluator" rather
than "agent"). Model selectable via the runner's `--judge-model
<flag>` which translates to `claude --model <...>` at invocation
time. Default Opus 4.x.

**Why opt-in even though it's free:** judge runs add latency and
output noise to a run. The structural pass is fast and deterministic;
the judge pass is slower and stochastic. Most calibration questions
are answerable from the structural numbers alone. Reach for
`--judge` when there's a specific open-ended question to answer
(e.g., "did the agent's reasoning make sense, not just whether it
referenced the right finding?").

**Judge output validation:** the judge is asked for structured JSON
per question. The runner validates with zod; malformed responses
mark the judge result as `failed` rather than guessing.

### 5.7 CI wiring

**One CI workflow, no agent calls in CI.** Fresh agent runs happen
on Andrew's machine as part of release prep. CI's job is to
*replay* the structural rubric over already-committed agent
outputs so per-release regressions are caught at PR time.

**`.github/workflows/evals-pr.yml`** — runs on PRs that touch
detector / scoring code. Replays the most recent
`evals/results/<version>/` outputs against the PR's build of the
crimes binary, re-scores structurally, and posts a diff comment
showing which scoring numbers changed.

```yaml
on:
  pull_request:
    paths:
      - "packages/core/src/detectors/**"
      - "packages/core/src/scoring/**"
      - "packages/language-js/src/**"
      - "packages/cli/src/**"

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: {node-version: "24", cache: pnpm}
      - run: pnpm install --frozen-lockfile=false
      - run: pnpm run build
      - run: pnpm run evals:replay   # rescores cached results, no agent calls
      - run: pnpm run evals:diff     # diffs replay output vs main's pinned summary
      - uses: actions/github-script@v7
        with:
          script: |
            const fs = require("fs");
            const summary = fs.readFileSync("evals/diff-summary.md", "utf8");
            // ... post or update PR comment with the diff summary
```

The PR diff is a *signal*, not a gate. It comments; it does not
block. Two-script split so each piece is independently runnable:

- `pnpm run evals:replay` — runs the structural rubric over
  `evals/results/<latest-version>/**/*.json` against the current
  crimes build. Writes fresh scoring numbers to `evals/replay/`.
- `pnpm run evals:diff` — compares `evals/replay/` to the pinned
  `evals/results/<latest-version>/summary.json` and writes
  `evals/diff-summary.md` for the PR comment.

**Fresh agent runs happen out-of-band:** Andrew runs `pnpm run
evals` locally (typically as part of Prompt M's release prep for
each milestone). The new results get committed and become the
"pinned" set the PR-diff workflow replays against. No credentials
in CI, no API costs, no scheduled cron to manage.

---

## 6. Housekeeping

The §20 dogfood appendix flagged items that didn't make 0.6.0.
These close in 0.7.0.

### 6.1 `direct_date` test-file exemption

`packages/core/src/detectors/direct-date.ts` currently flags
`Date.now()` / `new Date()` usage in test files as high severity.
The §20 appendix called this out as a false positive — test files
intentionally inject dates as `now: () => new Date(NOW_ISO)`.

**Fix:** apply the same `TEST_FILE_RE` check that
`scoring/build.ts`, `petty/build.ts`,
`return-shape-roulette.ts`, and (as of 0.6.0)
`large-file.ts` use. Skip emission entirely when `ctx.file` matches.

**File path:** `packages/core/src/detectors/direct-date.ts`. Reuse
the shared regex from a new helper at
`packages/core/src/util/test-files.ts` (consolidate the five
copy-pasted regexes while we're here).

**Tests:** existing tests + one new "skipped on test file" case +
one new "not skipped on non-test file" counter-test.

**Release-notes hint:** add to `RELEASE_NOTES.direct_date["0.7"]`
in the per-detector release-notes map (§4.4).

### 6.2 0.6.0 noise baseline (Appendix B)

Run `crimes scan packages docs` against `main` at the Prompt-A SHA,
capture the full findings, write to this plan as Appendix B.
Compare to §20:

- Which §20 false positives are now closed?
  - `cli_command_registrar` shape (8 register* function FPs)
  - `todo_density` self-reference (1 FP)
  - `test_file` shape on large_file (2 FPs: `reporter.test.ts`,
    `context.test.ts`)
  - `direct_date` in tests (1 FP — closed in Prompt A of THIS
    release, so the baseline captures pre-fix state if Prompt A is
    sequenced after the baseline; or post-fix state if before)
- What new findings did the 0.6.0 detectors introduce on
  first-party code?
  - `layer_violation` (any?)
  - `circular_dependency` (any?)
  - `deep_import` (any?)
  - frontend detectors (none — crimes is a Node CLI, not a UI)
  - duplication detectors (likely some — the codebase has grown)
- Severity distribution shift?

The appendix is signal for 0.8.0+ tuning decisions, same role §20
played for 0.6.0's `cli_command_registrar` and `test_file` shapes.

### 6.3 Split `reporter/src/human.ts`

826 lines, 34 top-level functions. Split by report type:

| New file | Owns |
|----------|------|
| `human/scan.ts` | `formatScanReport` + helpers |
| `human/context.ts` | `formatContextReport` + helpers |
| `human/hotspots.ts` | `formatHotspotsReport` + helpers |
| `human/diff.ts` | `formatDiffReport` + helpers |
| `human/verdict.ts` | `formatVerdictReport` + helpers |
| `human/explain.ts` | `formatExplainReport` + helpers |
| `human/audit.ts` | `formatAuditSuppressionsReport` + helpers |
| `human/feedback.ts` | `formatFeedbackReport` + helpers (NEW in 0.7.0) |
| `human/shared.ts` | Colour, table, line-formatting helpers shared across reports |
| `human/index.ts` | Barrel — re-exports the public `format*` functions |

Each file should land below 200 lines. Public API unchanged
(`packages/reporter/src/index.ts` re-exports from `human/index.ts`).

**Verification:** byte-identical output on the bundled fixture
(`docs/fixtures/messy-ts-app.json` → human format). Smoke test
runs every command's human output and diffs against pre-split.

### 6.4 Split `language-js/src/parse.ts`

943 lines, 35 top-level functions. §20 noted "splitting it has real
cost" — the AST classifier has tightly-coupled internals. Split by
handler family, keeping the coupled bits together:

| New file | Owns |
|----------|------|
| `parse/index.ts` | Public `parseFile` entry — orchestrates the family handlers |
| `parse/walk.ts` | The AST walker (the shared traversal that every family runs over) |
| `parse/functions/index.ts` | Function extraction entry |
| `parse/functions/shapes.ts` | Shape classification (domain / test_callback / cli_command_registrar / react_component / page_export / route_handler / unknown) |
| `parse/imports.ts` | Import statement extraction |
| `parse/jsx.ts` | JSX element extraction |
| `parse/literals.ts` | String/number literal extraction (for direct_date and todo_density) |
| `parse/types.ts` | Shared interfaces (`ParsedFile`, `ParsedFunction`, `FunctionShape`, etc.) |

**Coupling note:** the shape classifier in
`parse/functions/shapes.ts` needs read access to the same AST node
the walker is currently visiting. The walker can pass the node
into a callback rather than the shape classifier requiring its own
re-walk. This is the "real cost" §20 referred to — designing the
callback interface so each family handler is independent.

**Tests:** every existing `parse.test.ts` case must pass without
modification. Any test that does pass after a behavioural change is
a regression. Add no new test coverage as part of this split —
keep the diff minimal.

**Verification:** run the full test suite. Smoke test confirms
binary output unchanged.

---

## 7. JSON schema implications

All additions are optional and back-compat. **`schema_version`
stays at `"0.1.0"`.**

### Per-finding

```ts
interface Finding {
  // … existing fields unchanged
  previously_suppressed?: true;
  previous_suppression?: {
    pinned_version: string;
    reason: string;
  };
}
```

Only set when `crimes scan` resurfaces a finding whose
feedback-sourced suppression has a stale `crimes_version_pinned`.

### Per-suppression

```ts
interface Suppression {
  fingerprint: string;
  reason: string;
  created_at: string;
  source?: "manual" | "feedback";       // NEW — default "manual"
  crimes_version_pinned?: string;       // NEW — only when source === "feedback"
}
```

Reading 0.5.0 / 0.6.0 suppressions files: every entry is treated as
`source: "manual"` (because the field is missing). No migration
needed; the file works unchanged.

### New report type — `FeedbackReport`

Output of `crimes feedback list` / `summary` / `recheck` /
`export --format json`:

```ts
interface FeedbackReport {
  schema_version: "0.1.0";
  report_type: "feedback";
  scope: "repo" | "global";
  source_file: string;                  // path to the .jsonl file read
  entries: FeedbackEntry[];
  summary?: {
    total: number;
    by_verdict: {tp: number; fp: number; known: number};
    by_detector: Record<string, {tp: number; fp: number; known: number}>;
    by_version: Record<string, number>;
    by_repo?: Record<string, number>;   // only present when scope === "global"
  };
}

interface FeedbackEntry {
  timestamp: string;
  crimes_version: string;
  fingerprint: string;
  finding_type: string;
  verdict: "tp" | "fp" | "known";
  note: string | null;
  scan_hash: string | null;
  resurfaced_from: string | null;
  repo?: string;                        // only present in global rollup
}
```

### Stability

All new fields are **optional and additive.** Existing JSON
consumers continue to work without modification:

- They ignore `previously_suppressed` on findings (or surface it if
  they want to render the "previously fp" badge).
- They ignore `source` / `crimes_version_pinned` on suppressions.
- They don't read the new `FeedbackReport` type (it's only emitted
  by `crimes feedback`, which they didn't previously call).

---

## 8. CI implications

Two workflow changes:

**New: `.github/workflows/evals-pr.yml`** (§5.7). Triggers on PRs
that touch detector / scoring / language / CLI code. Replays
already-committed eval results against the PR's crimes build using
the structural rubric (no fresh agent calls), then posts a diff
comment. Doesn't block.

**Updated: `.github/workflows/ci.yml`**: add a test-matrix entry
for the new feedback subcommand + new `evals/runner` package. No
behaviour change for existing entries.

### No secrets, no API budget

Fresh agent runs happen on Andrew's machine using the `claude` and
`codex` CLIs against his existing subscription auth. CI never
invokes an agent and never needs API credentials. This keeps the
release pipeline simple and removes a category of "credential
expired / cap exceeded" failures we'd otherwise have to manage.

If we later decide CI needs fresh runs, we'll add that as an
explicit follow-up — for 0.7.0, the deliberate constraint is
"local subscription only."

### Cost shape

Zero. All agent calls happen under Andrew's existing Claude and
Codex subscriptions. No per-call billing, no monthly cap to track.
Judge runs use the same `claude` CLI as agent runs, so they're
also subscription-covered.

---

## 9. Tests and fixtures

### New unit tests

**`packages/core/src/feedback/*.test.ts`:**

- `write.test.ts` — appending entries; verdict transitions; note
  validation (required when `fp`).
- `read.test.ts` — latest-entry-wins read semantics; filters
  (since, verdict, detector).
- `resurface.test.ts` — minor-version comparison logic; edge
  cases (future-pinned, malformed pinned, manual suppressions
  never resurface).
- `release-notes.test.ts` — per-detector hint lookup; fallback
  message when no entry.

**`packages/cli/src/commands/feedback.test.ts`:**

- `crimes feedback write` end-to-end against a temp repo.
- `crimes feedback list` filters.
- `crimes feedback summary` aggregation.
- `crimes feedback export --append-global` idempotency.
- `crimes feedback recheck` filters resurfaced findings only.
- Exit codes: `0` success, `2` usage error (missing `--note` on
  `--verdict fp`, unknown fingerprint without `--no-verify`, etc.).

**`packages/core/src/suppressions.test.ts` (extended):**

- Suppression with `source: "feedback"` and matching pinned
  version → silenced.
- Suppression with `source: "feedback"` and stale pinned version
  → resurfaced with annotations.
- Suppression with `source: "manual"` and any version → silenced
  (manual suppressions never resurface).
- Future-pinned suppression → silenced + stderr warning.

### Fixture extension

The bundled `examples/messy-ts-app` gains:

- A pre-canned `.crimes/suppressions.json` with one
  `source: "feedback"` entry pinned to `"0.6"`, so the test_file
  shape from 0.6.0 has been "marked fp" in a prior release.
- A pre-canned `.crimes/feedback.jsonl` with a handful of entries
  spanning `0.6.0` and `0.7.0` so `crimes feedback list/summary`
  has data to render.

These are committed (they're the test data for `crimes feedback`
end-to-end tests).

**Eval fixture corpus:** see §5.2. Hand-crafted fixtures
(05-08, 09-10) are committed. OSS clones (02-04) are gitignored
bodies + committed meta files.

### Integration / smoke

The `pnpm --filter crimes smoke` script (which already runs every
command's `--help` + the bundled fixture) gains:

- `crimes feedback --help` (smoke check)
- `crimes feedback list` against the bundled fixture's pre-canned
  `feedback.jsonl` → assert non-empty
- `crimes feedback recheck` against the bundled fixture → assert
  the pre-canned 0.6-pinned suppression is listed

`pnpm run evals -- --fixture 01 --scenario refactor --agent
claude --no-judge` is the eval-harness smoke check. Andrew runs
it locally as part of release prep (Prompt M) and ad-hoc whenever
calibration questions come up.

---

## 10. Docs and website updates

### Existing docs to update

- **`docs/suppressions.md`** — new `source` and
  `crimes_version_pinned` fields; explanation of the auto-resurface
  mechanism; integration with `crimes feedback`.
- **`docs/json-schema.md`** — new `FeedbackReport` type table
  entry; new optional fields on `Finding` and `Suppression`.
- **`docs/agent-usage.md`** — feedback loop section: how an agent
  consuming `crimes` output should surface the feedback hint to
  the user; how to interpret `previously_suppressed: true`.
- **`docs/ci.md`** — note about feedback-sourced suppressions
  surviving across CI runs (they're committed to
  `.crimes/suppressions.json`); note about the auto-resurface
  pattern on minor version bumps (no CI behaviour change, but the
  finding count will jump after every minor upgrade until the
  resurfaced findings are re-confirmed).
- **`docs/releases/v0.7.0.md`** — drafted release notes mirroring
  the v0.6.0.md structure (TL;DR, noise disclaimer, what's
  shipped, what's not, what to read next, what's coming in 0.8.0).
- **`README.md`** — bullet for the feedback loop; bullet for the
  eval harness; "Shipped in 0.7.0" section.
- **`ROADMAP_STATUS.md`** — M2 marker stays complete; new "0.7.0
  shipped" entries for the feedback loop and eval harness.
- **`AGENTS.md`** — section on the feedback loop's role in the
  agent workflow.
- **`.claude/skills/crimes/SKILL.md`** — agents learn to surface
  the feedback hint and to read `previously_suppressed`.

### New docs

- **`docs/feedback.md`** — the user-facing guide to `crimes
  feedback`. CLI surface, storage layout, the auto-resurface
  mechanism, the multi-project rollup workflow.
- **`docs/evals.md`** — the contributor-facing guide to the eval
  harness. Directory layout, how to add a fixture, how to add a
  scenario, how to interpret results.

### Website

- **`apps/website/landing/index.html`** — hero pill updated to
  `v0.7.0` with link at `/docs/`. `SoftwareApplication` JSON-LD
  bumped. Roadmap timeline entry added.
- **`apps/website/landing/llms.txt`** — feedback loop + eval
  harness mentioned in the shipped surface.
- **Starlight site** — Sync picks up `docs/feedback.md` and
  `docs/evals.md` automatically via `apps/website/scripts/sync-
  docs.mjs`. No manual sidebar changes (Starlight auto-generates
  the IA from the file tree).

---

## 11. Risks and mitigations

### Feedback fatigue risk

**Risk:** every scan adds an inline hint per finding, so a 22-
finding scan adds 22 hints. Andrew tires of seeing them, ignores
them, and the feedback loop doesn't start.

**Mitigation:**
- Hint is one line, not a paragraph.
- Hint is suppressed when piped to a file or `--no-color`.
- After 100 entries in `.crimes/feedback.jsonl`, suppress the hint
  on findings whose detector already has 5+ entries (the threshold
  is configurable). Once you have data on a detector, you don't
  need the prompt anymore.

### Auto-resurface confusion risk

**Risk:** Andrew upgrades from 0.7.x to 0.8.0 and is surprised to
see 15 "old" false positives reappear. Concludes crimes is buggy.

**Mitigation:**
- The first scan after a minor bump emits a one-line stderr
  breadcrumb: "5 feedback-sourced suppressions resurface because
  they were pinned to 0.7. Run `crimes feedback recheck` to
  review." Same mechanism as the 0.6.0 `detectors.disable`
  breadcrumb.
- `crimes feedback recheck` is designed for fast triage (see §4.1
  output sample).
- `docs/feedback.md` documents the mechanism prominently as a
  design feature, not a surprise.

### Eval harness flakiness risk

**Risk:** Agents are non-deterministic. The same scenario produces
different responses on different runs, scoring varies, and the
PR-diff workflow's "regression vs prev version" check produces
false alarms.

**Mitigation:**
- `temperature: 0` where the CLI exposes it.
- Per-version results include a `run_id` so we can run the same
  version multiple times and estimate variance.
- The regression check uses a tolerance band (default ±10%)
  before flagging.
- Judge-model pass is opt-in local; CI never depends on judge
  output (judge models are even less reproducible than the agents
  being judged).

### Vendor OSS fixture rot

**Risk:** OSS upstreams rewrite history, deprecate repos, or
change licenses. Pinned-SHA clones break.

**Mitigation:**
- Every OSS clone is pinned to a specific SHA.
- `evals/fixtures/0X-name/.crimes-eval-meta.json` records the
  upstream + license at vendoring time.
- `pnpm run evals:setup` fails loudly if a clone can't be
  retrieved at the pinned SHA.
- If an upstream disappears, we either swap in a replacement
  fixture or mark that fixture as `archived: true` in the meta
  file and skip it in the runner. Documented in `docs/evals.md`.

### Refactor regression risk (the two splits)

**Risk:** Splitting `reporter/src/human.ts` or
`language-js/src/parse.ts` introduces a behavioural change that
slips past tests.

**Mitigation:**
- Both splits are pure refactors. No new feature work in those
  prompts.
- Existing tests must pass without modification (any test that
  needs to change is a behavioural-change red flag).
- Bundled-fixture human output and JSON output diffed before/after
  in the prompt's done-when criteria.
- Smoke test verifies every command runs against the bundled
  fixture and produces identical output to a pre-split snapshot.

### Subscription-CLI availability risk

**Risk:** the `claude` or `codex` CLI isn't installed, isn't on
PATH, or isn't logged in. The eval run errors mid-flight, possibly
after partial result files have been written.

**Mitigation:**
- Runner does a startup check: `which claude` + `which codex` +
  a dry-run auth probe (`claude -p "ping" --output-format json`
  with a short timeout). Fails fast with a setup message rather
  than crashing partway through.
- Partial result files are written atomically (tmp + rename) so
  a crashed run never leaves a half-written result file.
- `pnpm run evals --agent claude` and `--agent codex` flags let
  Andrew skip the absent agent and still get useful runs from the
  one that works.

### Schema-bloat risk

**Risk:** Every release adds optional fields; consumers eventually
have to handle dozens of optional shapes.

**Mitigation:**
- New fields are *strictly additive* and back-compat. Existing
  consumers continue to work.
- 0.7.0 adds five fields total (`Finding.previously_suppressed`,
  `Finding.previous_suppression`, `Suppression.source`,
  `Suppression.crimes_version_pinned`, plus the new `FeedbackReport`
  type). Well under the noise threshold.
- `schema_version` stays at `"0.1.0"`. If a future release needs
  breaking changes, that's the rev.

---

## 12. Implementation prompt sequence

13 prompts. Each lands on `main` independently with passing
build / typecheck / test before the next starts.

### Foundation phase (Prompts A–B)

#### Prompt A — `direct_date` test-file exemption + shared helper

Build `packages/core/src/util/test-files.ts` exporting
`TEST_FILE_RE` and `isTestFile(path)`. Refactor the four existing
copy-pasted regex sites (`scoring/build.ts`, `petty/build.ts`,
`return-shape-roulette.ts`, `large-file.ts`) to use the shared
helper. Apply the same check in
`packages/core/src/detectors/direct-date.ts` — skip emission when
`isTestFile(ctx.file)`.

**Done when:** the four refactored sites still pass their existing
tests unchanged; `direct-date.test.ts` gains a "skipped on test
file" case and a "not skipped on non-test file" counter-case; the
full test suite passes; smoke test passes.

#### Prompt B — Suppression schema additions

Add `source?: "manual" | "feedback"` and
`crimes_version_pinned?: string` to the `Suppression` type and the
zod schema. Update `mergeSuppressions` / read paths to treat
missing `source` as `"manual"` (back-compat).

Implement the resurface logic in `applySuppressions`:
feedback-sourced suppressions with stale pinned minor are kept in
`findings[]` with `previously_suppressed: true` and the
`previous_suppression` block.

Add a stderr breadcrumb the first time a scan resurfaces ≥ 1
feedback-sourced suppression: "5 feedback-sourced suppressions
resurface because they were pinned to 0.6. Run `crimes feedback
recheck` to review."

**Done when:** `suppressions.test.ts` gains the four new cases
(matching pinned silenced; stale pinned resurfaced; manual never
resurfaced; future-pinned silenced + warning); reading a 0.5.0 /
0.6.0 `.crimes/suppressions.json` works unchanged.

### Track A phase (Prompts C–F)

#### Prompt C — `crimes feedback` write + storage core

Build `packages/core/src/feedback/{write,read,types}.ts`. JSONL
read/write, append-only, latest-entry-wins read semantics.

Build `packages/cli/src/commands/feedback.ts` — the Commander
subcommand registration plus the `write` verb
(`crimes feedback <fingerprint-or-id> --verdict ... --note ...
[--file ...]`). On `--verdict fp`, write to BOTH
`.crimes/feedback.jsonl` AND `.crimes/suppressions.json` (source:
"feedback", crimes_version_pinned: current minor).

**Done when:** `crimes feedback large_function::src/x.ts::foo
--verdict fp --note 'bar'` writes one JSONL entry and one
suppression entry; re-running with `--verdict tp` deletes the
suppression and appends a new JSONL entry; missing `--note` on
`--verdict fp` exits 2; tests pass.

#### Prompt D — `crimes feedback list` + `recheck` + release-notes map

Implement the `list` and `recheck` verbs. Build the
release-notes map at
`packages/core/src/feedback/release-notes.ts` with the initial
entries for `direct_date` / `large_function` /
`todo_density` (per §4.4).

`recheck` walks the suppressions file, finds feedback-sourced
entries with stale pinned minor, and prints each one with the
release-notes hint and the re-feedback command lines.

**Done when:** `crimes feedback list --since 30d` filters
correctly; `crimes feedback recheck` lists all resurfaced findings
with hints; per-detector hint lookup falls back gracefully when no
entry exists.

#### Prompt E — `crimes feedback summary` + `export` + global rollup

Implement the `summary` verb (aggregation by verdict / detector /
version / repo). Implement the `export` verb with
`--append-global` (dedupe by `(repo, timestamp, fingerprint)`) and
`--format md`.

Build the global rollup file shape: `~/.crimes/feedback-
rollup.jsonl` gains a `repo` field per entry.

**Done when:** `crimes feedback export --append-global` appends to
the global file and is idempotent across runs; `crimes feedback
summary --global` aggregates across all rolled-up repos.

#### Prompt F — Reporter integration (inline hints)

Update `packages/reporter/src/human/scan.ts` (and the
context/diff/verdict equivalents — apply consistently) to print
the inline `Give feedback: ...` hint per finding. For resurfaced
findings (`previously_suppressed: true`), print the alternate
"Previously marked fp" hint and reference
`crimes feedback recheck`.

Suppression rules apply (`!isTTY`, `--no-color`, `--format json`).

After 5+ entries on a given detector in
`.crimes/feedback.jsonl`, suppress the hint for that detector's
findings (configurable via a planned future
`thresholds.feedbackHintCap` — for 0.7.0 ship as a hardcoded 5).

**Done when:** bundled-fixture human output gains the inline hints;
JSON output unchanged; piped output unchanged; the per-detector
suppression kicks in after the 5th entry.

### Refactor phase (Prompts G–H)

#### Prompt G — Split `reporter/src/human.ts`

Per §6.3. Split into 9 files under `human/`. Barrel re-export
preserves the public API.

**Done when:** every file ≤ 200 lines; bundled-fixture human
output byte-identical to pre-split (diff exit 0); smoke test
passes; reporter tests pass without modification.

#### Prompt H — Split `language-js/src/parse.ts`

Per §6.4. Split by AST handler family with the walker passing
each node to family callbacks.

**Done when:** every file in `parse/` ≤ 250 lines (the AST
walker file may run a little longer); `parse.test.ts` passes
without modification; smoke test passes.

### Track B phase (Prompts I–L)

#### Prompt I — Evals scaffold

Create `evals/` directory. Add `evals/README.md`,
`evals/runner/package.json` (private workspace package),
`evals/fixtures/.gitkeep`, `evals/scenarios/.gitkeep`,
`evals/results/.gitkeep`.

Add `evals/fixtures/fixtures.meta.json` registry shape and the
per-fixture `.crimes-eval-meta.json` for OSS clones.

Build `evals/runner/src/setup.ts` (the
`pnpm run evals:setup` entry that reads meta files and clones OSS
fixtures at pinned SHAs).

Add `pnpm run evals` and `pnpm run evals:setup` scripts at the
root `package.json`.

**Done when:** `pnpm run evals:setup` is a no-op when no OSS meta
files exist (it'll get real work in Prompt J); `pnpm-workspace.yaml`
includes `evals/runner` as a workspace; the runner stub prints
"no scenarios configured" and exits 0.

#### Prompt J — Fixture corpus + scenario library

Build the 5-8 hand-crafted fixtures (05-10 per §5.2). Vendor the
2-3 OSS clones at chosen SHAs (Andrew picks the specific repos
during this prompt).

Build `evals/scenarios/{refactor,bugfix,review,context,plan}.json`
with one scenario per fixture per kind (~50 scenarios total).

**Done when:** `pnpm run evals:setup` clones every meta'd OSS
repo; every fixture has its own `crimes.config.json` if needed;
running `crimes scan` against each fixture produces findings
(except the two clean controls).

#### Prompt K — Runner + structural scoring

Build `evals/runner/src/index.ts`, `agents/claude.ts`,
`agents/codex.ts`, `score.ts`. CLI flags per §5.4. Structural
assertions per §5.5. Result-file shape per §5.5.

Skip judge-model pass for this prompt (next prompt).

**Done when:** `pnpm run evals --fixture 01 --scenario refactor
--agent claude` runs end-to-end and writes a result file; the
result file passes zod validation; missing or unauthenticated
`claude`/`codex` CLIs produce a clear setup message rather than
crashing mid-run.

#### Prompt L — Judge pass + replay/diff scripts + PR workflow

Build `evals/runner/src/judge.ts`. Judge runs via the same `claude`
CLI as agent runs (different role/prompt). Validate judge output
with zod; malformed JSON marks the per-question score as `failed`.

Build `pnpm run evals:replay` (runs structural rubric over
already-committed `evals/results/<latest-version>/**/*.json`
against the current crimes build; writes to `evals/replay/`) and
`pnpm run evals:diff` (compares replay output to the pinned
summary; writes `evals/diff-summary.md`).

Add `.github/workflows/evals-pr.yml` per §5.7. No secrets, no
agent invocations in CI.

**Done when:** `pnpm run evals -- --judge` invokes the judge for
each scenario after the structural pass; `pnpm run evals:replay`
and `pnpm run evals:diff` run end-to-end against committed
results; the PR workflow passes `act` validation (or equivalent
dry-run).

### Polish + release prep phase (Prompt M)

#### Prompt M — Docs, schema, fixture, release prep, baseline eval run

Update every doc per §10. Drafted `docs/releases/v0.7.0.md`.
Update README, AGENTS, ROADMAP_STATUS, SKILL. Bump
`packages/cli/package.json` to `0.7.0`. Regenerate
`docs/fixtures/messy-ts-app.json`. Update the website hero pill +
roadmap entry + llms.txt.

Run the 0.6.0 noise baseline (§6.2) and fill in Appendix B of
this plan.

**Run the full eval suite locally** as part of release prep
(`pnpm run evals` with both agents, structural-only — judge stays
opt-in). Commit the new pinned results to
`evals/results/0.7.0/`. This becomes the "0.7.0 reference point"
the PR-diff workflow replays against for the rest of the
release's lifetime.

**Done when:** `pnpm build && pnpm typecheck && pnpm test &&
pnpm --filter crimes smoke && pnpm --filter @crimes/website
build` all pass; Appendix B is populated; `evals/results/0.7.0/`
contains result files for every fixture × scenario × agent
combination; release-notes draft is committed.

### Sequencing rationale

- **A before B.** The shared `isTestFile` helper from A is used
  by no other 0.7.0 work, but bundling it with the `direct_date`
  fix is cleaner than two micro-prompts.
- **B before C.** The suppression schema changes are foundational
  to Track A.
- **C, D, E, F can ship in any order after B is in.** Sequencing
  is convenience; parallelise if multiple agents land them
  concurrently.
- **G and H can ship in any order, any time after A.** No
  feedback-loop or eval-harness work depends on them. Cleanest to
  ship before M (the release prep) so the regenerated fixture
  output reflects the post-split state.
- **I before J, K, L.** Scaffold is foundational.
- **J before K.** Runner needs fixtures + scenarios to run
  against.
- **K before L.** Judge is built on top of the structural runner.
- **M last.** Docs + release prep + appendix B reflect the final
  state of everything else.

---

## 13. Success criteria

`crimes@0.7.0` ships when all of the following are true:

1. **Calibration infrastructure is in place.** `crimes feedback`
   subcommand is functional, frictionless, and feeds both
   `.crimes/feedback.jsonl` (per-repo) and the global rollup.
2. **The fp ↔ suppression auto-resurface loop works end-to-end.**
   A finding marked `fp` in 0.7.0 is silenced for 0.7.x and
   resurfaces on first 0.8.x scan with the inline "previously fp"
   annotation.
3. **The 0.6.0 noise baseline is captured.** Appendix B of this
   plan is filled with the full first-party self-scan output, with
   side-by-side counts vs §20.
4. **Eval harness runs locally against the user's subscriptions.**
   `pnpm run evals --fixture 01 --scenario refactor` succeeds
   using the local `claude` CLI; full `pnpm run evals` succeeds
   against all 8-10 fixtures × ~5 scenarios × Claude + Codex.
   No API keys involved.
5. **0.7.0 reference eval results are committed.** Prompt M's
   release-prep run produces a complete set under
   `evals/results/0.7.0/` that the PR-diff workflow replays
   against.
6. **PR-time eval diff workflow is configured.** The
   `evals-pr.yml` workflow is in the repo; a test PR against this
   branch produces a diff comment with replayed scoring numbers.
7. **No false positives on the §20 dogfood items closed in this
   release.** `direct_date` does not flag test files. The
   `cli_command_registrar` and `todo_density` and `test_file`
   exemptions are unchanged (they shipped in 0.6.0).
8. **Both legit large files are split.** `reporter/src/human.ts`
   and `language-js/src/parse.ts` are below the God File
   threshold with no behavioural change.
9. **Schema is unchanged where required.** `schema_version` stays
   at `"0.1.0"`. All additions are optional and back-compat.
10. **Only one new command landed.** `crimes feedback` is the only
    new top-level command. The rest of the CLI surface is unchanged
    from 0.6.0.
11. **Build / typecheck / test / smoke / website-build are all
    green.** `pnpm build && pnpm typecheck && pnpm test && pnpm
    --filter crimes smoke && pnpm --filter @crimes/website build`.
12. **Docs are complete.** `docs/feedback.md`, `docs/evals.md`,
    every updated existing doc, and the README list the feedback
    loop and eval harness.
13. **Release notes drafted.** `docs/releases/v0.7.0.md` carries
    the full surface inventory (just `crimes feedback`), the
    feedback-loop pitch, the eval-harness pitch, the noise-baseline
    appendix pointer, and a clear pointer at 0.8.0 as the
    detector-tuning milestone.

If 1, 2, 4, 11 fail, the release is not ready. 3, 5, 6, 7, 8, 12,
13 are must-ship but smaller surface; 9, 10 are stability gates
that should be effortless.

---

## 14. Appendix A — Andrew's multi-project dogfood setup

The minimum-friction setup to start collecting feedback across all
of Andrew's parallel projects:

### One-time setup (after 0.7.0 publishes)

```bash
# 1. Upgrade the global install
npm install -g crimes@0.7.0
crimes --version    # should report crimes@0.7.0

# 2. For each project you want to dogfood, run init
cd ~/dev/project-a && crimes init
cd ~/dev/project-b && crimes init
cd ~/dev/project-c && crimes init
# ... etc.

# 3. Add the rollup directory (one-time, machine-global)
mkdir -p ~/.crimes
```

### Per-scan workflow

```bash
# Scan a project. Findings now include the inline feedback hint.
cd ~/dev/project-a && crimes scan

# See a finding you disagree with? One command, one note.
crimes feedback large_function::src/billing.ts::generateInvoice \
  --verdict fp \
  --note "Builder pattern — DSL chain, not mixed responsibilities"

# See a finding crimes caught that mattered? Mark it too.
crimes feedback circular_dependency::src/api/handlers/index.ts:: \
  --verdict tp \
  --note "Yep, this caught a real cycle I'd been ignoring"

# At end of session, push your judgment to the global rollup
crimes feedback export --append-global
```

### Weekly review (or whenever)

```bash
# See your judgment across all projects
crimes feedback summary --global

# Pick a project you want to dig into
crimes feedback list --repo . --since 7d --verdict fp
```

### Per-release-bump workflow

```bash
# After upgrading crimes (e.g. 0.7.x → 0.8.0):
npm install -g crimes@0.8.0

# Re-scan each project. The scan output flags resurfaced findings.
cd ~/dev/project-a && crimes scan

# Walk the resurfaced ones one at a time
crimes feedback recheck

# Re-confirm or mark resolved per the recheck output's command lines
```

### Recommended cadence

- **Per scan:** capture feedback on 1-2 surprising findings. Don't
  feel obligated to mark every finding — partial signal is fine.
- **Weekly:** `crimes feedback export --append-global` from each
  project you've been active in.
- **Per crimes minor bump:** `crimes feedback recheck` in each
  project, walk through the resurfaced findings, take 5-10
  minutes per project.

---

## 15. Appendix B — `crimes@0.7.0` dogfood signal

> Captured by `crimes scan packages docs --format json` against
> `main` at the 0.7.0 release SHA — i.e. the *post*-0.7.0 baseline
> (Prompt A's `direct_date` test-file exemption has landed, so the
> §20 false positive on test files is no longer present here).
> Side-by-side with §20 of `DETECTOR_SCORING_COMPLETION_PLAN.md`.

### Findings on `crimes scan packages docs` (0.7.0)

**Total: 118 findings — 5 high, 99 medium, 14 low.**

Per-detector counts (top, by frequency):

| Detector                  | Count | Notes |
|---------------------------|-------|-------|
| `exact_duplicate_block`   |    48 | Big new contributor in 0.6.0 — most fire on test-file or fixture boilerplate. Top tuning target for 0.8.0. |
| `large_function`          |    44 | Three legitimate high-severity hits (`registerFeedbackCommand`, `analyseRoute`, `classifyShape`); rest are mediums on the new `human/<report>.ts` and `parse/*.ts` files post-split. |
| `large_file`              |    12 | Two new highs from 0.7.0 work (`cli/src/commands/feedback.ts` and `core/src/context.ts`); the rest are docs / generated. |
| `direct_date`             |     5 | All in non-test source files (the Prompt A fix held — zero test-file false positives). |
| `todo_density`            |     4 | Mostly the rolling plan docs themselves. |
| `option_bag_junk_drawer`  |     2 |  |
| `weak_test_signal`        |     1 |  |
| `name_behavior_mismatch`  |     1 |  |
| `commented_out_code`      |     1 |  |

### Closed false positives from §20

| §20 false positive | Fix | Closed? |
|--------------------|-----|---------|
| Commander `register*Command` (8 functions) | `cli_command_registrar` shape (0.6.0) | ✅ — no `register*Command` flagged in this scan |
| `direct_date` in `suppressions.test.ts` | `test_file` exemption (Prompt A, 0.7.0) | ✅ — zero test files in the `direct_date` hit list |
| `todo_density` on own source | self-reference exemption (0.6.0 Prompt P) | ✅ — `todo_density` only fires on plan docs, not detector source |
| `reporter.test.ts` / `context.test.ts` God File | `test_file` shape for `large_file` (0.6.0) | ✅ — no test files in the `large_file` hit list |

### New patterns from 0.6.0 detectors (post-0.7.0 view)

- `exact_duplicate_block` — 48 findings. Dominant. Most fire on
  fixture / scenario boilerplate (the new evals/ tree)
  and on near-identical detector-test scaffolding. Strong candidate
  for a per-fixture exemption shape in 0.8.0.
- `layer_violation` / `circular_dependency` / `deep_import` —
  **zero findings** on this scan. Either the codebase is layer-
  clean (plausible — strict module boundaries are part of the
  product) or these detectors need fixture-level exercise.
  Both eval fixtures `08-stress-dependency` exist explicitly to
  exercise them; tuning evidence will come from there.
- IA detectors (`orphaned_destination`, `parallel_destination`,
  `permission_ia_drift`, `action_label_drift`,
  `command_drift_docs_code_drift`) — also zero. The
  crimes monorepo is a CLI, not an app — IA detectors are
  designed for product code. Stress fixture `05-stress-ia-drift`
  covers them.

### Severity distribution shift

| Severity | 0.5.0 (§20) | 0.7.0 (this) | Δ |
|----------|-------------|--------------|---|
| high     | 9           | 5            | -4 |
| medium   | 49          | 99           | +50 |
| low      | 10          | 14           | +4 |
| **total**| **68**      | **118**      | **+50** |

The total roughly doubled. Almost all of the growth is in the
`exact_duplicate_block` bucket (zero in 0.5.0 → 48 in 0.7.0)
because the detector landed in 0.6.0 and crimes has accumulated
its own internal boilerplate (test fixtures, near-duplicate split
files) since then. The high-severity bucket dropped because the
two large-file `test_file`-shape false positives from §20 are now
correctly classified.

### Signal for 0.8.0+ tuning

The empirical priorities, in rough order:

1. **`exact_duplicate_block` per-shape threshold.** 48 findings is
   well past the patience threshold for a real human. Most fire on
   test/fixture boilerplate. Add a `test_file` / `fixture_file`
   shape with a much higher threshold (or skip entirely on those
   shapes by default) for 0.8.0.
2. **`large_function` on the new split files.** The `human/*.ts`
   and `parse/*.ts` files post-Prompt G/H sit just above the
   medium threshold. The split was deliberate and the resulting
   files are coherent — these are candidates for the user to mark
   `fp` and watch resurface in 0.8.0 to validate the
   `cli_command_registrar`-style shape work.
3. **Dependency-graph detectors need real-world exercise.** Zero
   findings on the crimes monorepo. Calibration evidence will
   come from OSS fixtures (`02-react-dashboard`,
   `03-node-cli-tool`, `04-monorepo`) once `pnpm run evals:setup`
   materialises them.
4. **`direct_date` real-world hits.** 5 findings — all in
   non-test source (suppression timestamps, baseline timestamps,
   feedback timestamps, audit timestamps). All five are
   *expected* — these modules legitimately stamp `new Date()` at
   the moment of writing. These are the next `crimes feedback fp`
   candidates; resurfacing on 0.8.0 will check whether a clock
   abstraction was introduced.

---

## Appendix C — What this plan deliberately doesn't do

It does **not add new detectors.** Period. The 0.6.0 slate is what
we calibrate. Detector-level changes in 0.7.0 are exemptions
(`direct_date` test-file skip) and bug fixes only.

It does **not add new commands beyond `crimes feedback`.** Track A
introduces one subcommand with five verbs. The rest of the CLI is
untouched.

It does **not bump `schema_version`.** Every addition is optional
and back-compat. The new `FeedbackReport` type is a new emission,
not a modification of existing reports.

It does **not add LLM-assisted detector modes.** Evals call LLMs;
detectors don't. This is wedge protection — "local, deterministic,
agent-native" stays load-bearing.

It does **not migrate to Rust.** Same wedge as every prior release:
TypeScript on Node, JSON-first, no LLM in the hot path.

It does **not add the Python language pack.** Open question in PRD
§26; revisit after 0.8.0 once we have 0.7.0 calibration data on
the TS/JS detector slate.

It does **not implement a hosted feedback collector.** All feedback
stays local on the user's machine. A future release may add opt-in
upload; 0.7.0 doesn't.

It does **not add feedback `expires_at` or `owner` fields.** The
minor-version auto-resurface mechanism replaces expiry; ownership
is irrelevant for a single-user dogfood loop.

It does **not block CI on eval-harness results.** The PR-diff
workflow posts a comment with the replayed scoring numbers; it
does not gate the merge. Eval scoring is signal, not policy.

It does **not run agents in CI.** Fresh agent runs happen on
Andrew's machine using subscription-authenticated `claude` and
`codex` CLIs. CI only replays the structural rubric over already-
committed result files.

It does **not commit to specific OSS fixture repos in this plan.**
Prompt I picks them; the meta files are the source of truth, not
this document.
