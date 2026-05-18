# Prompt: build eval scenario coverage for the 23 uncovered detectors

Paste this into a fresh Claude Code session at the repo root. The
prompt is self-contained — it links to the artifacts you need.

---

I want to close the detector-coverage gap on the crimes eval matrix.
Right now only 12 of 35 detectors are referenced by any scenario (34%
coverage). I want to bring this to 100%. Your job is to author the
new scenarios — and any fixture additions or new fixtures they
require — to cover the 23 uncovered detectors listed below.

## Context (read these before authoring)

- `CLAUDE.md` — repo-level conventions, especially the "Eval baseline
  version bumps" section.
- `evals/README.md` — eval harness overview, especially the
  "Scenario↔fixture coverage discipline" section that explains why
  every `referenced_findings` entry must fire on its fixture.
- `evals/scenarios/*.json` — existing scenarios. Each has `id`,
  `fixture`, `kind`, `prompt`, `expected_artifacts`, and optional
  `judge_questions`. Match this shape exactly.
- `evals/fixtures/fixtures.meta.json` — fixture registry. Each
  fixture has an `id` (NN), `path`, `name`, `kind`, and `purpose`.
- `packages/core/src/scan.ts` — the `builtInDetectors` list. The
  source of truth for "what detectors exist."
- `packages/core/src/detectors/<name>.ts` — each detector's
  trigger conditions live in its `run(ctx)` body. Read these to know
  what content a fixture needs to fire the detector.
- `evals/runner/src/verify-scenarios.ts` — the CI gate that ensures
  every `referenced_findings` entry produces an actual finding on the
  fixture's scan output. Your work must pass `pnpm --filter
  evals-runner evals:verify-scenarios` before you commit.

The kind-of-work pattern is set by what already exists. Notable prior
work to model on:
- `evals/scenarios/refactor.json` — `refactor-07-stress-frontend`
  references `design_token_escape`, `responsive_fragility`,
  `accessible_interaction_risk` and the fixture
  `evals/fixtures/07-stress-frontend/src/Card.tsx` produces all three.
  This is the right shape: one scenario, one fixture, multiple
  related detectors covered together.
- `evals/scenarios/review.json` — `review-05-stress-ia-drift`
  references `concept_alias_drift` + `orphaned_destination` together
  on the same IA-drift fixture.

## The 23 uncovered detectors

Grouped by cluster — author cluster-by-cluster so related detectors
share fixtures where it's natural.

**Petty / single-file (8):**
- `commented_out_code` — dead `// const ...` blocks
- `logic_in_comments` — prose-only rules ("Only admins can refund")
- `magic_domain_literal_scatter` — same literal across many files
- `name_behavior_mismatch` — `calculatePreview()` that also persists
- `negative_flag_maze` — `if (!a && !b && !c)` stacks
- `option_bag_junk_drawer` — `describeX(options: object)` with no shape
- `return_shape_roulette` — function returns 2+ disjoint shapes
- `weak_test_signal` — `it("does X", () => {})` with 0 assertions

Many of these likely fire on `examples/messy-ts-app` already. Verify
which do via `node packages/cli/dist/index.js scan
examples/messy-ts-app --format json`, then write scenarios pointing at
the right fixture.

**IA / cross-file (9):**
- `action_label_drift` — same action button labelled differently in JSX
- `command_drift_docs_code_drift` — CLI bin docs disagree with code
- `copy_ia_drift` — JSX label text varies across files for the same action
- `docs_code_drift` — docs reference files that don't exist
- `duplicated_navigation_source` — same destination in two nav definitions
- `missing_agent_context` — repo has no AGENTS.md / CLAUDE.md / SKILL.md
- `parallel_destination` — two routes that look like duplicates
- `permission_ia_drift` — permission label drift across files
- `route_metadata_drift` — route path, title, component name disagree

`copy_ia_drift` and `command_drift_docs_code_drift` are known to need
fixture content the current `05-stress-ia-drift` doesn't have
(see the commit that created `05` for context). Likely needs a new
JSX-drift fixture and a new CLI-bins fixture. Or extend `05` if
that's cleaner.

**Dependency / architecture (3):**
- `deep_import` — `import { x } from "pkg/dist/internal/..."`
- `high_fan_in_fan_out` — files with many in-edges and out-edges
- `layer_violation` — `architecture.layers` + `rules` config-driven

`deep_import` and `layer_violation` already fire on
`08-stress-dependency` — author scenarios pointing at it. The
verifier will tell you if the rubric is wrong.

**Frontend (2):**
- `duplicate_component_shape` — two React components with the same JSX shape
- `visual_regression_review_hint` — image/screenshot diffs needing review

Likely need new content under `07-stress-frontend` or a new fixture.

**Structural (1):**
- `large_file` — file over 300 lines threshold

The current `messy-ts-app/src/billing.ts` is 310 lines and fires
`large_file`. Just reference it in a scenario.

## The procedure (per detector)

1. **Run the detector's trigger conditions.** Open its source file in
   `packages/core/src/detectors/<name>.ts` and read the `run(ctx)`
   body + any `analyse*` helpers. Note what `ctx.*` fields it needs
   (e.g. `ctx.ia`, `ctx.parsed`, `ctx.imports`) and what specific
   patterns it looks for. Don't guess.

2. **Check what already fires where.** Run `node
   packages/cli/dist/index.js scan <fixture-path> --format json` for
   each existing fixture and see which fire the detector you're
   adding. If one already fires it, use that fixture. If none do,
   you'll need to extend a fixture or build a new one.

3. **Author the scenario.** Add an entry to the relevant
   `evals/scenarios/<kind>.json`. The scenario's kind should match
   the natural agent task for that detector — `bugfix` for
   testability detectors (`weak_test_signal`, `direct_date`),
   `review` for IA drift, `refactor` for structural / duplication,
   `plan` for prioritisation, `context` for "summarise this repo".
   Pattern after the existing scenarios in that file.

4. **Verify.** Run `pnpm --filter evals-runner
   evals:verify-scenarios`. It must pass. If it fails, either fix
   the fixture to fire the detector or shrink the scenario's
   `referenced_findings` to match reality. Prefer fixture fixes.

5. **Build before scanning.** After detector code changes (you
   shouldn't make any), or after fixture additions (you will), run
   `pnpm --filter crimes build`. The runner uses the CLI bundle.

## Authoring constraints (load-bearing)

- **Don't change detector code.** This pass is about coverage, not
  product changes. If a detector seems broken, surface it as a
  comment in the relevant scenario's `judge_questions` rather than
  patching the detector. (Exception: if the detector is silent on a
  fixture that's textbook-correct for its trigger, that's the same
  class of bug as the resolver bug fixed in 0.7.2 — flag it for the
  user to decide.)
- **One scenario per detector minimum, ideally one scenario covering
  2-3 related detectors.** Don't pad — a scenario is meaningful only
  if it tests a real agent task.
- **Fixtures stay realistic.** Don't pile every trigger into one
  file. Real codebases have these patterns scattered; the fixtures
  should too. Prefer extending an existing thematic fixture (05 for
  IA, 06 for duplication, 07 for frontend, 08 for deps) over
  inventing new ones.
- **`expected_priority` is for the highest-leverage finding the
  agent would surface first** — usually the one with the highest
  agent_risk or severity. Don't pick it arbitrarily.
- **Add 1-2 `judge_questions` per scenario.** These score reasoning
  quality, not just slug presence. Pattern after existing ones in
  the same file (e.g., `review-01-messy-ts-app.judge_questions`).
- **Don't touch `evals/runner/src/score.ts`, `judge.ts`, or
  `verify-scenarios.ts`.** Those are the measurement apparatus —
  changing them while authoring scenarios introduces measurement
  drift on top of coverage changes.

## Deliverable

- All 23 uncovered detectors covered by at least one scenario.
- `pnpm --filter evals-runner evals:verify-scenarios` exits clean.
- `pnpm --filter @crimes/core test` and `pnpm --filter
  @crimes/language-js test` still green (no regressions from
  fixture additions).
- Bump `packages/cli/package.json` `version` to the next patch and
  re-run `pnpm --filter evals-runner evals` so the new baseline
  lands in `evals/results/<new-version>/`. Commit the directory
  alongside the scenario/fixture changes. Follow the procedure in
  `evals/README.md` § Versioning policy.

Commit cluster-by-cluster (one commit per cluster). Use descriptive
commit messages that name which detectors gained coverage.

## What I'll do at the end

After your run completes I'll re-run `evals:verify-scenarios` and
spot-check a few scenarios to confirm the rubrics match what the
fixtures genuinely stress. If everything checks out, the new baseline
becomes our pre-release reference.
