# AGENTS.md

Instructions for AI coding agents (Codex CLI, Claude Code, Cursor, Aider, etc.)
working inside this repository. Humans should read [`README.md`](./README.md)
and [`CONTRIBUTING.md`](./CONTRIBUTING.md) first; this file is the
agent-facing summary.

> Project: `crimes` — a CLI that scans a repo for **change risk** and
> **agent risk**, not style or security. JSON output is the product contract.
> See [`PRD.md`](./PRD.md) for the spec, [`README.md`](./README.md) for the
> user-facing tour, and [`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md) for what
> currently works.

---

## Install

`crimes` is published on npm:

```bash
npm install -g crimes      # global install — provides the `crimes` binary
npx crimes scan .          # or one-shot via npx
```

For working **on** this monorepo, requires **Node.js ≥ 18** and **pnpm 10**:

```bash
pnpm install        # install workspace dependencies
pnpm build          # build all packages (tsup)
```

You can then invoke the locally-built CLI from the repo root:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js scan examples/messy-ts-app
```

Convenience scripts:

```bash
pnpm scan:example         # build CLI + scan the bundled fixture (human format)
pnpm scan:example:json    # same, JSON output
```

## Build, typecheck, test

Run from the repo root. These three commands are the canonical "is the
workspace healthy" check — run them after any non-trivial change.

```bash
pnpm build       # tsup across every package
pnpm typecheck   # tsc --noEmit across every package
pnpm test        # vitest run across every package
pnpm ci          # all three, sequentially (matches CI)
```

Per-package work:

```bash
pnpm --filter @crimes/core build
pnpm --filter @crimes/core test
pnpm --filter crimes smoke   # pack + install + run the published tarball in a temp dir
```

`pnpm --filter crimes smoke` is the gold-standard "did I break the release
path" check. It runs every shipped command against the bundled fixture.

## Scan commands (the product itself)

All commands print to stdout. `--format json` is the **stable contract** —
prefer it when planning or making decisions programmatically.

```bash
# Directory scan
crimes scan [path]
crimes scan . --format json
crimes scan . --all                       # show every finding (not just top 10)

# Changed-files-only scan (requires a git repo)
crimes scan --changed --format json                     # working tree vs HEAD
crimes scan --changed --base main --format json         # + commits on this branch
crimes scan --changed --base origin/main --format json  # + commits not yet pushed

# Single-file context (findings + likely tests + safe-editing notes)
crimes context <file> --format json
crimes context <file> --root ./packages/api --format json

# Git churn × findings, ranked by aggregate risk
crimes hotspots --format json
crimes hotspots --since 30d --format json
```

If you are running against a checkout that has not been published to npm
yet (e.g. an unreleased version on `main`), prefix everything above with
`node packages/cli/dist/index.js` after running `pnpm build`.

**Not yet implemented** — do not invoke or reference these in generated docs:
`crimes diff`, `crimes verdict`, `crimes baseline`, `crimes explain`,
`crimes init`, `crimes ask`. See
[`docs/agent-usage.md`](./docs/agent-usage.md) for the full shipped/deferred
matrix and [`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md) for milestone status.

## Project architecture

Public TypeScript monorepo, pnpm workspaces. Boundaries encode the layering —
keep them clean.

```
apps/website/              # crimes.sh — static landing page
packages/cli/              # `crimes` binary (Commander) — orchestration only
packages/core/             # detector engine, finding schema, scoring
packages/language-js/      # TS/JS file discovery + AST parsing
packages/reporter/         # human + JSON formatters
examples/messy-ts-app/     # intentional-mess fixture for tuning
```

Rules of thumb:

- **`core` owns the finding schema and scoring.** Detectors live here. They
  must not import language-specific parsers directly — they consume a
  `DetectorContext` populated by a language pack.
- **`language-js` is one of many future language packs.** Don't push TS/JS
  assumptions into `core`.
- **`reporter` is presentation only.** No score computation, no filtering
  beyond what `core` exposes. New display data → extend the finding schema.
- **`cli` is orchestration only.** Argument parsing, config loading, calling
  `core`, handing results to a `reporter`. No detection logic.

## Coding style

- **TypeScript, ESM, Node ≥ 18.** Strict mode is on.
- Format/lint: nothing wired up yet (Biome or ESLint/Prettier is a "pick one
  later" decision per [`CLAUDE.md`](./CLAUDE.md)). Match the surrounding
  style — generally 2-space indent, double quotes, semicolons, trailing
  commas on multi-line literals.
- Imports use `.js` extensions even from `.ts` source (ESM/NodeNext
  resolution).
- Tests sit next to source files (`detector.ts` + `detector.test.ts`),
  Vitest, no global setup file. New detectors **must** have a fixture-based
  unit test before they ship.
- Findings must include concrete **evidence** strings — facts a reader can
  verify against the AST or file contents. No verdicts without receipts.
- Keep heuristics conservative: a noisy detector is a disabled detector.
- Default `crimes scan` shows top findings only; `--all` is opt-in. Mirror
  that "signal over exhaustiveness" rule when adding new surfaces.
- See [`CLAUDE.md`](./CLAUDE.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md)
  for full design constraints, especially the package boundaries.

## Using `crimes` while editing this repo

`crimes` scans itself. Before risky edits in `packages/core` or
`packages/language-js`, run:

```bash
crimes context packages/core/src/scan.ts --format json
crimes scan packages/core --format json
```

After a change, diff the findings against the pre-edit run. New
`severity: "high"` findings introduced by your edit are blockers unless the
user explicitly accepts the risk. See
[`docs/agent-usage.md`](./docs/agent-usage.md) for the full pre/post-edit
workflow.

## Safety rules for agents

These are non-negotiable inside this repo:

1. **Never publish.** Do not run `npm publish`, `pnpm publish`, `pnpm
   changeset publish`, `git tag`, or `git push --tags` without explicit user
   instruction. The package name `crimes` on npm is unclaimed; publishing
   prematurely is unrecoverable.
2. **Never force-push, reset, or rewrite shared branches** (`main`, any
   branch present on `origin/`). Local feature branches are fine.
3. **Don't auto-fix detector findings** without (a) a clear user request,
   (b) tests that cover the touched behaviour, and (c) a scoped change. The
   product's whole point is to surface risk — silently "fixing" findings
   erodes the contract.
4. **Don't add backwards-compatibility hacks** to the finding schema. If
   you need to break it, bump `schema_version` and update
   [`docs/json-schema.md`](./docs/json-schema.md).
5. **Don't introduce LLM SDKs, Rust, or oclif** in v0 — explicitly deferred
   per [`PRD.md`](./PRD.md) and [`CLAUDE.md`](./CLAUDE.md).
6. **Don't re-implement ESLint, Biome, Semgrep, or SonarQube detectors.**
   `crimes` is positioned as change-risk and agent-risk, not style or
   security. If a detector is "could be a linter rule", push back before
   building it.
7. **Treat the JSON schema as a public API.** New optional fields are OK;
   removing or repurposing existing ones is a breaking change requiring a
   `schema_version` bump.
8. **Run `pnpm ci` before declaring work complete.** Build + typecheck +
   test must all pass.
9. **Commit when work is ready** (per the user's global preference in
   `CLAUDE.md`). Don't wait for explicit permission on every logical unit.
   Hold off if changes are mid-refactor, contain secrets, or the user has
   said "don't commit yet" for this branch.

## Where to read next

- [`PRD.md`](./PRD.md) — authoritative product spec.
- [`README.md`](./README.md) — user-facing tour.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add detectors, languages,
  and run the dev loop.
- [`CLAUDE.md`](./CLAUDE.md) — design constraints and stack decisions.
- [`docs/agent-usage.md`](./docs/agent-usage.md) — pre/post-edit workflow
  for agents (this file's deep cousin).
- [`docs/json-schema.md`](./docs/json-schema.md) — wire format reference.
- [`docs/skills.md`](./docs/skills.md) — what's bundled for Claude Code and
  Codex.
- [`ROADMAP_STATUS.md`](./ROADMAP_STATUS.md) — what currently ships vs what
  is planned.
