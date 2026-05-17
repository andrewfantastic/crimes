# crimes evals

Reproducible agent-vs-fixture eval harness for calibrating crimes
detector quality across releases. Lives outside `packages/` because it
is a contributor surface, not part of the published `crimes` binary.

## What this harness does

The harness runs every (fixture × scenario × agent) combination,
captures each agent's response, and scores it two ways:

1. **Structural rubric** — deterministic, fast, runs every CI replay.
   Checks the agent's response against `expected_artifacts` on the
   scenario (referenced findings, referenced files, forbidden actions,
   priority finding-type).

2. **Judge-model pass** (opt-in, `--judge`) — sends the transcript to
   the same `claude` CLI in a different role with the scenario's
   `judge_questions`. Captures structured per-question scores.

Per-version results land in `results/<crimes-version>/<agent>/`,
committed to the repo. Subsequent releases compare against the pinned
results to catch detector-tuning regressions.

## Versioning policy (calibration bumps)

The runner keys results by the `version` field of
`packages/cli/package.json`. That version doubles as the **rubric
version**: any change that moves pass rates *without* changing the
product the agent is reasoning about gets a patch bump, even if no
release is cut.

Changes that trigger a calibration bump:

- `evals/runner/src/score.ts` — structural scoring logic.
- `evals/runner/src/judge.ts` and any judge prompts.
- A scenario's `expected_artifacts` rubric in `evals/scenarios/*.json`.
- A fixture whose finding set changes (`evals/fixtures/*`).

Changes that do **not** trigger one (they bump for product reasons
anyway when they release):

- Detector code in `packages/core/` or `packages/language-js/`.
- CLI output, config, docs.

The procedure:

1. Land the calibration change.
2. Bump `packages/cli/package.json` `version` to the next patch in the
   **same commit** as the change.
3. Re-run `pnpm run evals` so the new baseline lands in
   `results/<new-version>/`. Commit the directory alongside.
4. Do **not** add a Changeset entry, do **not** publish, do **not** cut
   a git tag — calibration bumps exist purely to redirect the results
   directory and preserve historical baselines.

The first calibration bump after a real release will usually show a
pass-rate delta that is a measurement correction, not a quality
improvement. Say so in the commit message — future readers shouldn't
mistake a scorer fix for an agent improvement.

## Why it's not in CI as a fresh-agent runner

The harness invokes the locally-installed `claude` and `codex` CLIs in
non-interactive mode. Both authenticate against the user's existing
subscription — no API keys, no per-call billing, no monthly caps. That
also means CI doesn't run fresh agents: the
`.github/workflows/evals-pr.yml` workflow only *replays* the structural
rubric against already-committed result files on PRs that touch
detector / scoring code. Fresh runs happen on Andrew's machine as
part of release prep (Prompt M of each milestone).

See [`docs/evals.md`](../docs/evals.md) for the contributor-facing
guide once the M2 release ships.

## Directory layout

```
evals/
  fixtures/                  # one directory per fixture
    01-messy-ts-app/         # symlink → ../../examples/messy-ts-app
    02-...                   # OSS clones (gitignored body, committed meta)
    05-stress-*              # hand-crafted, committed
    09-clean-tiny            # control: should produce zero findings
    fixtures.meta.json       # registry: name, kind, source, pinned SHA
  scenarios/                 # one JSON file per scenario kind
    refactor.json
    bugfix.json
    review.json
    context.json
    plan.json
  results/                   # per-version pinned eval outputs
    0.7.0/
      claude/...
      codex/...
      summary.json
  runner/                    # the runner workspace package
    src/index.ts
    src/setup.ts
    src/agents/{claude,codex}.ts
    src/score.ts
    src/judge.ts
```

## Running

```bash
# One-time per machine — clones OSS fixtures at their pinned SHAs.
pnpm run evals:setup

# Run every fixture × scenario × agent (structural only).
pnpm run evals

# Subset of the matrix.
pnpm run evals -- --agent claude
pnpm run evals -- --fixture 01
pnpm run evals -- --scenario refactor

# Add the judge-model pass.
pnpm run evals -- --judge
```

## What's in the runner

The runner is a private pnpm workspace package (`evals-runner`); it's
not published. It depends on `@crimes/cli` for invoking the binary
under test and shells out to `claude` / `codex` for agent runs.

Per fixture × scenario × agent invocation:

1. `cd evals/fixtures/<NN>-<name>` and `crimes scan -f json
   > /tmp/eval-<run-id>-scan.json`. That output is the agent's context.
2. Send the scenario `prompt` + scan JSON to the agent.
3. Capture transcript + final response.
4. Apply the structural rubric per §5.5 of the calibration plan.
5. (Optional) judge-model pass per §5.6.
6. Write `results/<crimes-version>/<agent>/<scenario-id>.json`.

## Adding a fixture

1. Pick a slot number (`02–10` are reserved for the §5.2 buckets;
   start higher for new categories).
2. Make `evals/fixtures/NN-name/` and add the project files.
   For an OSS clone, write a `.crimes-eval-meta.json` and leave the
   body gitignored (see existing entries for shape).
3. Add scenarios for the fixture to the relevant
   `evals/scenarios/<kind>.json` array.
4. Register the fixture in `evals/fixtures/fixtures.meta.json`.

## Adding a scenario

Edit the matching `evals/scenarios/<kind>.json` (or add a new kind).
Each scenario carries an `id`, the fixture id, the verbatim agent
`prompt`, and an `expected_artifacts` block — the structural rubric
checks against the latter on every run.
