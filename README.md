# crimes

> A crime scene investigator for your codebase. **Built for agents, readable by humans.**

`crimes` is an open-source CLI that scans a repository for maintainability risks, code smells, duplicated business rules, weak test boundaries, and patterns that confuse AI coding agents.

It is **not** another linter. Linters catch local syntax and style issues. `crimes` answers a higher-value question:

> _Where in this repo is future change most likely to go wrong, and what should a human or coding agent know before editing it?_

This README assumes you have never installed a Node.js CLI before, and it also gives a "for agents" section near the bottom. Pick whichever you are.

---

## Status

Pre-release. Milestone 0 (repo foundation) and the very first slice of Milestone 1 (basic `crimes scan`) are implemented. The CLI is **not yet published to npm** — for now you run it from this monorepo.

What works today:

- `crimes scan` over any TypeScript / JavaScript directory
- `crimes scan --format json` machine-readable output
- Four detectors:
  - **Large file** ("God File")
  - **Large function** ("God Function")
  - **TODO / FIXME density** ("Unfinished Business")
  - **Direct `Date.now()` / `new Date()`** ("Temporal Recklessness")

What does **not** work yet:

- Publishing to npm (`npx crimes` will not resolve)
- Homebrew
- Any LLM-assisted features
- `crimes context`, `crimes diff`, `crimes hotspots`, `crimes verdict` (planned)

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
repo: messy-ts-app  ·  6 findings

HIGH severity (1)
  1. src/billing.ts (generateInvoice)
     Charge: God Function
     Summary: generateInvoice is 75 lines long (threshold 60).
     Evidence:
       · 75 lines from 27 to 101
       · 1.3× the configured threshold (60)
       · defined as a function
     id=crime_00001  confidence=0.75

MEDIUM severity (2)
  2. src/todo.ts
     Charge: Unfinished Business
     Summary: 12 TODO/FIXME markers (387.1 per 1k LOC).
     ...

Total 6  ·  high 1  medium 2  low 3
```

JSON output is the **stable product API** — its shape is documented inline in `packages/core/src/finding.ts` and versioned via `schema_version`.

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

## For coding agents

If you are an AI coding agent (Claude Code, Cursor, Codex, Copilot Workspace, etc.) operating in a repo that uses `crimes`, prefer this workflow:

```bash
# Before editing anything in a file, get a structured risk report:
crimes scan <path-to-file-or-dir> --format json
```

The JSON output is a stable contract:

```jsonc
{
  "schema_version": "0.1.0",
  "repo": { "name": "...", "root": "..." },
  "summary": { "total": 6, "high": 1, "medium": 2, "low": 3 },
  "findings": [
    {
      "id": "crime_00001",
      "type": "large_function",
      "charge": "God Function",
      "severity": "high",
      "confidence": 0.75,
      "file": "src/billing.ts",
      "symbol": "generateInvoice",
      "lines": [27, 101],
      "summary": "...",
      "evidence": ["75 lines from 27 to 101", "..."],
      "scores": { "severity": 0.65, "confidence": 0.75, "agent_risk": 0.7 }
    }
  ]
}
```

Guidelines for agents:

- Read findings with `severity: "high"` first.
- Treat `evidence` as ground truth — it is generated from the AST, not heuristics.
- `agent_risk` (when present) is a hint that the area is easy to misread.
- Do not suppress findings without an explicit reason in your PR description.

---

## Repository layout

```
crimes/
├── apps/
│   └── website/              # crimes.sh static skeleton
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
```

Build a single package:

```bash
pnpm --filter @crimes/core build
```

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
