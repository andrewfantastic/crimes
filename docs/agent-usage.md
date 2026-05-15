# Using `crimes` with coding agents

`crimes` was designed for AI coding agents (Claude Code, Cursor, Codex, Copilot
Workspace, Aider, OpenAI agents, etc.) operating in unfamiliar codebases. The
`--format json` output is the **stable contract** that agents should consume —
the human-readable report is a rendering of the same underlying findings.

This document covers:

- The recommended pre-edit / post-edit workflow
- How to interpret findings as an agent
- What is guaranteed, what may change, and what is **not** implemented yet

If you are looking for the wire format itself, read
[`docs/json-schema.md`](./json-schema.md).

---

## Recommended workflow

### 1. Pre-edit scan (before touching files)

Run a scoped scan on the file or directory you are about to edit. Pipe to
`jq` or parse the JSON directly.

```bash
crimes scan path/to/file-or-dir --format json
```

(While the package is unpublished, invoke it from this monorepo as
`node packages/cli/dist/index.js scan path/to/file-or-dir --format json`.)

What to do with the result:

- **Read every `high` severity finding** in `findings[]` before you write code.
  Each one is concrete evidence that this area is risky to touch.
- **Treat `evidence` as ground truth.** It is generated deterministically from
  the AST or file contents — not from an LLM.
- **Use `lines` + `symbol`** to focus reading on the exact functions or ranges
  the detector flagged, instead of re-reading the whole file.
- **Use `suggested_actions[].kind`** as a hint for the kind of change the
  detector thinks is safe. They are heuristics, not instructions — pick the
  ones that match the user's request.

### 2. Make the edit

Apply your change. `crimes` does not run during editing; it has no LSP and no
watch mode.

### 3. Post-edit scan (after writing the change)

Re-run the same scan and **diff the findings against the pre-edit run**:

```bash
crimes scan path/to/file-or-dir --format json
```

Decision rule:

- If your edit introduced a **new `severity: "high"` finding**, treat it as a
  blocker — either fix it before continuing, or surface it to the user with a
  short justification ("I'm leaving this God Function because the user asked
  for the smallest possible diff").
- If `agent_risk` increased on a touched file, slow down: you may have added
  a hidden source of truth, a duplicate rule, or a misleading name.
- If the total counts in `summary` went down, you are in a good state.

This pre/post pattern is the single highest-leverage way to use `crimes` from
inside an agent loop. It catches the class of regressions that linters do not
see: code that compiles, passes tests, and still makes the repo harder to
change next time.

### 4. Communicate trade-offs explicitly

If you are leaving findings in the code on purpose, **say so in your PR
description or chat reply**, citing the finding `id` and `charge`. Do not
silently suppress findings.

Good:

> Leaving `crime_00001` (God Function on `generateInvoice`) as-is for this
> change — splitting it is out of scope for the bugfix you asked for.

Bad:

> Done.

---

## How to read a finding

Every finding has the same shape (see [`json-schema.md`](./json-schema.md) for
the full type). The five fields that matter most to an agent are:

| Field              | What it tells you                                                                  |
| ------------------ | ---------------------------------------------------------------------------------- |
| `severity`         | `"high" \| "medium" \| "low"` — the headline triage signal                         |
| `file` + `lines`   | Where the smell lives. `lines` is `[start, end]`, inclusive, 1-based               |
| `symbol`           | The function or method name when applicable (e.g. for `large_function` findings)    |
| `evidence`         | Concrete facts the detector observed — quote these back when explaining changes     |
| `scores.agent_risk`| `0–1`. Higher means easier for an LLM to misread, duplicate, or break this area    |

`severity` is for triage. `scores.agent_risk` is the more interesting signal
for an agent: it stays high even when the local severity is low, when the
area is structurally confusing (multiple sources of truth, weak tests, hidden
side effects, etc.).

Default sort order is severity-first (`high → medium → low`), then confidence,
then file path, then line number. You can re-sort by `scores.agent_risk` if
your goal is "what should I read before editing", rather than "what is most
broken".

---

## Concrete example

This is the actual current output of `pnpm scan:example:json` against
[`examples/messy-ts-app`](../examples/messy-ts-app), with the absolute repo
path sanitised:

```jsonc
{
  "schema_version": "0.1.0",
  "repo": {
    "name": "messy-ts-app",
    "root": "/path/to/crimes/examples/messy-ts-app"
  },
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
      "summary": "generateInvoice spans 204 lines — past the 60-line threshold for a single function. Bodies this size usually mix unrelated responsibilities, and an agent editing one section often misses interactions in another.",
      "evidence": [
        "lines 37–240 (204 lines)",
        "3.4× the configured 60-line threshold",
        "function declaration"
      ],
      "scores": { "severity": 0.9, "confidence": 0.95, "agent_risk": 0.95 },
      "suggested_actions": [
        {
          "kind": "extract_function",
          "description": "Extract cohesive sections into named helpers so each responsibility can be read, tested, and edited in isolation.",
          "risk": "low"
        }
      ]
    }
    // ...four more findings elided. Full output:
    //   docs/fixtures/messy-ts-app.json
  ]
}
```

Full file: [`docs/fixtures/messy-ts-app.json`](./fixtures/messy-ts-app.json).

---

## What is and isn't shipped today

The brief above describes the workflow `crimes` is built around. Some of the
commands the PRD calls out are **not yet implemented**, and you should not
rely on them in agent instructions yet:

| Command                            | Status                  |
| ---------------------------------- | ----------------------- |
| `crimes scan [path]`               | ✅ shipped              |
| `crimes scan --format json`        | ✅ shipped              |
| `crimes scan --all`                | ✅ shipped              |
| `crimes scan --no-color`           | ✅ shipped              |
| `crimes scan --changed`            | 🚧 not yet implemented  |
| `crimes context <file>`            | 🚧 not yet implemented  |
| `crimes diff main...HEAD`          | 🚧 not yet implemented  |
| `crimes verdict`                   | 🚧 not yet implemented  |
| `crimes hotspots`                  | 🚧 not yet implemented  |
| `crimes explain <id>`              | 🚧 not yet implemented  |
| `crimes init`                      | 🚧 not yet implemented  |
| `crimes ask` / LLM-assisted modes  | 🚧 not yet implemented  |

Until those land, the pre/post-edit workflow works as plain
`crimes scan <path> --format json` on the directory or file you are about to
touch.

---

## Stability and schema versioning

- `schema_version` at the top of the report is the source of truth. While
  `schema_version === "0.1.0"`, the shape documented in
  [`json-schema.md`](./json-schema.md) is stable.
- Optional score fields (`scores.blast_radius`, `scores.churn`,
  `scores.test_gap`) and `related_files` are **reserved** — they are documented
  in the schema but only populated when later milestones add the underlying
  signals (git history, cross-file analysis). Treat their absence as "not
  computed", not "zero".
- Breaking changes to the wire format will bump `schema_version`. Agents
  should refuse to consume output whose `schema_version` they don't know.

---

## Exit codes

Today `crimes scan` always exits `0`, even when findings are present.
"Fail the build on new high-severity findings" lands in a later milestone
along with baseline support. Until then, gate on the JSON yourself:

```bash
crimes scan . --format json \
  | jq -e '.summary.high == 0' >/dev/null
```
