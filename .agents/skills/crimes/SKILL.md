---
name: crimes-codebase-risk
description: Use when editing, reviewing, or investigating a TypeScript / JavaScript codebase that ships with the crimes CLI. Helps agents run pre-edit context checks, post-edit scans, and interpret findings before risky changes.
---

# crimes — codebase risk workflow

`crimes` is a deterministic CLI (no LLM) that reports change risk and
agent risk. JSON output is the stable contract; prefer it when planning.

## When to run it

- Before editing an unfamiliar file: `crimes context <file> --format json`
- Before a broad refactor: `crimes scan <path> --format json`
- After edits: `crimes scan --changed --format json`
- Before merging a branch: `crimes verdict --format json`

## Decision rules

- Treat any new `severity: "high"` finding introduced by your edit as a blocker unless the user explicitly accepts it.
- Read `evidence[]` before acting; it contains deterministic facts, not LLM opinion.
- Use `scores.agent_risk` to decide which findings need human attention first.
- If a finding is a false positive, record feedback with `crimes feedback <fingerprint> --verdict fp --note "<why>"` rather than silently ignoring it.
