# `.planning/`

Internal planning artefacts. Not user-facing, not published to
[`crimes.sh/docs/`](https://crimes.sh/docs/) — the docs-sync pipeline
in `apps/website/scripts/sync-docs.mjs` reads `<repo>/docs/` only.

- `archive/` — implementation plans for shipped milestones, preserved
  as written. Useful as a record of rationale and sequencing the
  commit diff alone can't reconstruct.
- Active plan documents (for in-flight versions) live at this top
  level until they ship, then move into `archive/`.

The authoritative product spec stays [`PRD.md`](../PRD.md). The live
milestone tracker stays [`docs/roadmap.md`](../docs/roadmap.md).
