# crimes

> A crime scene investigator for your codebase. **Built for agents, readable by humans.**

`crimes` is an open-source CLI that scans a repository for maintainability risks, code smells, duplicated business rules, weak test boundaries, and patterns that confuse AI coding agents.

It is **not** another linter. Linters catch local syntax and style issues. `crimes` answers a higher-value question:

> _Where in this repo is future change most likely to go wrong, and what should a human or coding agent know before editing it?_

This README assumes you have never installed a Node.js CLI before, and it also gives a "for agents" section near the bottom. Pick whichever you are.

---

## Status

Pre-release `0.0.1`. Milestone 0 (repo foundation) and the first slice of Milestone 1 (`crimes scan` with four detectors) are implemented. The CLI is **not yet published to npm** — for now you run it from this monorepo.

What works today:

- `crimes --help` / `crimes --version`
- `crimes scan [path]` over any TypeScript / JavaScript directory
- `crimes scan --format json` machine-readable output (stable, versioned via `schema_version`)
- Four detectors:
  - **Large function** ("God Function") — escalates to `high` at ≥2× the line threshold
  - **Large file** ("God File") — same severity ramp
  - **TODO / FIXME density** ("Unfinished Business")
  - **Direct `Date.now()` / `new Date()`** ("Temporal Recklessness")
- A publish-tarball smoke test (`pnpm --filter crimes smoke`) that builds, packs, installs `crimes@0.0.1` into a clean temp directory, and exercises every shipped command and flag. Runs in CI on every commit, so the moment the package goes live `npx crimes scan` works.

What does **not** work yet:

- Publishing to npm (`npx crimes` does not resolve)
- Homebrew
- Any LLM-assisted features
- `crimes context`, `crimes diff`, `crimes hotspots`, `crimes verdict`, `crimes scan --changed` (planned)

See [PRD.md](./PRD.md) for the full roadmap.

---

## For first-time CLI users

You need **Node.js 18 or newer** and **pnpm**.

```bash
# 1. Install Node, if you don't have it:
#    https://nodejs.org  (LTS is fine)

# 2. Install pnpm:
npm install -g pnpm

# 3. Clone and install
git clone https://github.com/crimes-sh/crimes.git
cd crimes
pnpm install

# 4. Build the workspace
pnpm build

# 5. Scan the bundled messy example
pnpm scan:example
```

You should see a colourful "CRIME SCENE REPORT" printed to your terminal.

---

## Quick start (existing Node devs)

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js scan ./your-project
node packages/cli/dist/index.js scan ./your-project --format json
```

Or scan the included fixture:

```bash
pnpm scan:example
pnpm scan:example:json
```

---

## Example output

Running `pnpm scan:example` produces something like:

```
CRIME SCENE REPORT
repo: messy-ts-app  ·  5 findings

HIGH severity (1)
  1. src/billing.ts:37-240 (generateInvoice)
     Charge: God Function
     Summary: generateInvoice spans 204 lines — past the 60-line threshold for a single function. ...
     Evidence:
       · lines 37–240 (204 lines)
       · 3.4× the configured 60-line threshold
       · function declaration
     id=crime_00001  confidence=0.95
  ...

Total 5  ·  high 1  medium 3  low 1
```

JSON output is the **stable product API** — see [`docs/json-schema.md`](./docs/json-schema.md) for the full schema and [`docs/agent-usage.md`](./docs/agent-usage.md) for the pre-edit / post-edit workflow.

---

## What it finds (today)

| Detector            | Charge                | What it does                                                                    |
| ------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `large_file`        | God File              | Flags files over a line threshold (default 300)                                 |
| `large_function`    | God Function          | Flags functions / methods / arrows over a body-line threshold (default 60)     |
| `todo_density`      | Unfinished Business   | Flags files with high density of `TODO` / `FIXME` / `XXX` / `HACK` markers      |
| `direct_date`       | Temporal Recklessness | Flags direct uses of `Date.now()` and `new Date()` in source files              |

Every finding includes **evidence** (raw facts the detector observed) and **scores** (`severity`, `confidence`, optional `agent_risk`), so downstream tools can rank or filter without re-running heuristics.

---

## Commands

### `crimes scan [path]`

Scan a directory. Defaults to the current directory.

```bash
crimes scan
crimes scan ./packages/api
crimes scan --format json
crimes scan --all          # show every finding, not just the top 10
crimes scan --no-color     # plain output for pipes/CI
```

That is the entire surface area today. More commands land in later milestones — see [PRD.md §22](./PRD.md).

---

## Configuration

Zero-config is the default. Drop a `crimes.config.json` at the repo root to override:

```json
{
  "include": ["src/**/*.{ts,tsx,js,jsx}"],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/*.generated.*"],
  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,
    "todoDensityPerKLoc": 10
  }
}
```

---

## Using `crimes` with coding agents

If you are an AI coding agent (Claude Code, Cursor, Codex, Copilot Workspace, Aider, etc.) operating in a repo that uses `crimes`, the recommended workflow is **pre-edit / post-edit scans on the file or directory you are about to touch**:

```bash
# 1. Before editing — get a structured risk report
crimes scan <path-to-file-or-dir> --format json

# 2. Make your change

# 3. After editing — re-scan the same path, diff the findings
crimes scan <path-to-file-or-dir> --format json
```

Decision rule: any **new `severity: "high"` finding** introduced by your edit should be treated as a blocker — fix it, or call it out explicitly to the user citing the finding `id` and `charge`.

The JSON output is a stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "repo": { "name": "messy-ts-app", "root": "/path/to/crimes/examples/messy-ts-app" },
  "summary": { "total": 5, "high": 1, "medium": 3, "low": 1 },
  "findings": [
    {
      "id": "crime_00001",
      "type": "large_function",
      "charge": "God Function",
      "severity": "high",
      "confidence": 0.95,
      "file": "src/billing.ts",
      "symbol": "generateInvoice",
      "lines": [37, 240],
      "summary": "generateInvoice spans 204 lines — past the 60-line threshold...",
      "evidence": ["lines 37–240 (204 lines)", "3.4× the configured 60-line threshold", "function declaration"],
      "scores": { "severity": 0.9, "confidence": 0.95, "agent_risk": 0.95 },
      "suggested_actions": [{ "kind": "extract_function", "description": "...", "risk": "low" }]
    }
  ]
}
```

For the full schema and the complete pre/post-edit workflow:

- 📄 [`docs/json-schema.md`](./docs/json-schema.md) — every field, what it means, what's reserved
- 🤖 [`docs/agent-usage.md`](./docs/agent-usage.md) — pre-edit/post-edit workflow, how to read findings, what's shipped vs deferred
- 🧪 [`docs/fixtures/messy-ts-app.json`](./docs/fixtures/messy-ts-app.json) — full example output

---

## Repository layout

```
crimes/
├── apps/
│   └── website/              # crimes.sh static site (no framework — pure HTML + CSS)
├── packages/
│   ├── cli/                  # crimes — Commander entrypoint, `crimes` binary (the published package)
│   ├── core/                 # @crimes/core — detector engine, finding schema, built-in detectors
│   ├── language-js/          # @crimes/language-js — file discovery + TS/JS AST parsing
│   └── reporter/             # @crimes/reporter — human and JSON output formats
├── examples/
│   └── messy-ts-app/         # intentionally crime-ridden fixture
├── .github/workflows/ci.yml
├── PRD.md                    # product requirements document
├── README.md
├── CONTRIBUTING.md
├── LICENSE                   # MIT
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Development

```bash
pnpm install                  # install everything
pnpm build                    # build all packages (tsup)
pnpm typecheck                # tsc --noEmit across the workspace
pnpm test                     # vitest run across the workspace
pnpm scan:example             # build CLI + run it on the fixture
pnpm scan:example:json        # same, as JSON
pnpm --filter crimes smoke    # publish-tarball smoke test (pack → install → run)
```

Build a single package:

```bash
pnpm --filter @crimes/core build
```

The `smoke` script is the canonical "does the published package actually work" check. It does an `npm pack`, installs the resulting tarball into a clean temp directory with `npm install`, and runs `--version`, `--help`, `scan`, and `scan --format json` against `examples/messy-ts-app`. CI runs it on every commit as the `publish-smoke` job.

---

## Roadmap (short version)

- **M0 — Repo foundation** ✅
- **M1 — First working CLI** — `crimes scan` with structural detectors (in progress)
- **M2 — Risk model** — scoring, git churn, hotspots
- **M3 — Agent context** — `crimes context <file>`
- **M4 — Diff and CI** — `crimes diff`, `--changed`, baseline, CI gates
- **M5 — Public launch** — npm, crimes.sh, polish
- **M6 — Homebrew / standalone binaries**

Full detail: [PRD.md](./PRD.md).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Good first issues will be tagged once the public repo exists.

---

## License

[MIT](./LICENSE). Use it freely.
