# Frontend findings

Frontend findings consume the **JSX inspection layer** that `crimes`
builds during parse. They flag UI-specific risks: hand-rolled values
that escape the design system, interactive elements without a label,
near-duplicate components that should share a primitive, and review
hints for changes that will look subtly different in the browser.

For the wire format, see [`docs/json-schema.md`](../json-schema.md).
For the agent workflow that consumes findings, see
[`docs/agent-usage.md`](../agent-usage.md).

## What ships

| `Finding.type`                  | Charge                       | Severity range | Confidence |
| ------------------------------- | ---------------------------- | -------------- | ---------- |
| `design_token_escape`           | Design Token Escape          | low-medium     | 0.70-0.85  |
| `accessible_interaction_risk`   | Hidden Interaction           | low-medium     | 0.70-0.85  |
| `duplicate_component_shape`     | Duplicate Component Shape    | low-medium     | 0.75-0.85  |
| `responsive_fragility`          | Responsive Fragility         | low            | 0.65-0.75  |
| `copy_ia_drift`                 | Copy / IA Drift (frontend)   | low-medium     | 0.70-0.80  |
| `visual_regression_review_hint` | Visual Regression Review Hint | low           | 0.65       |

All six emit the standard `Finding` shape. The detectors run only on
files that the parser identifies as JSX-bearing.

---

## Design Token Escape (`design_token_escape`)

**What it detects.** Hard-coded colour, spacing, or font-size values
embedded directly in JSX where the repo has a design-token system
nearby (Tailwind config, CSS variables, or a `tokens.ts` module).

**Example evidence.**

```text
3 hard-coded colour literals in JSX
lines: 28 (#0a0a0a), 47 (rgba(255, 99, 132, 0.5)), 102 (#fff)
tokens detected in repo: tailwind.config.ts → colors.neutral.900
```

**Why it matters.** Hard-coded values bypass the design system. An
agent updating a colour later won't know it exists, and the
component drifts away from the rest of the UI on every edit.

**Suggested fix.** Replace the literal with the token name. If no
matching token exists, the design system needs to grow first — file
that as a separate change rather than encoding a one-off here.

---

## Hidden Interaction (`accessible_interaction_risk`)

**What it detects.** JSX elements that handle pointer events
(`onClick`, `onMouseDown`, etc.) but have no accessible label —
typically a `<div>` or `<span>` with handlers and no `aria-label`,
`aria-labelledby`, role, or visible text child.

**Example evidence.**

```text
<div onClick={handlePicker}> at line 47
no children, no aria-label, no role
nearest semantic alternative: <button>
```

**Why it matters.** Interactive elements without a label fail
screen-reader navigation and keyboard interaction. Agents writing
new UI often reach for `<div onClick>` because it's the path of
least resistance; the finding redirects them at write-time rather
than at audit-time.

**Suggested fix.** Use the appropriate semantic element (`<button>`,
`<a>`, `<input type="checkbox">`). If a non-semantic element is
required, add a `role` and `aria-label`, plus `tabIndex={0}` and
keyboard handlers.

---

## Duplicate Component Shape (`duplicate_component_shape`)

**What it detects.** Two or more React components whose JSX bodies
have the same AST hash (modulo whitespace and identifier renaming).
Consumes the same hash index as the `exact_duplicate_block` and
`near_duplicate_block` detectors but scopes the comparison to
component-shaped functions.

**Example evidence.**

```text
identical JSX shape across 3 components
src/ui/Card.tsx (lines 10–48)
src/ui/Tile.tsx (lines 14–52)
src/ui/PanelCard.tsx (lines 8–46)
shared shape: <article><header><h3 /></header>...<footer />
```

**Why it matters.** When three components share a layout, the team
usually meant to extract a primitive and didn't. The next change
(a padding tweak, an a11y fix) gets applied to one and forgotten on
the others, and the divergence locks the duplication in.

**Suggested fix.** Extract a shared `Card` primitive that takes the
specific bits as props or children. The detector counts identical
shape, not identical content — so the primitive doesn't have to be
exhaustive.

---

## Responsive Fragility (`responsive_fragility`)

**What it detects.** Components mixing many breakpoint-specific
utility classes (`sm:hidden md:flex lg:grid-cols-3`) without a
visible breakpoint strategy, or hard-pixel widths (`w-[847px]`) that
won't survive a font-size change.

**Example evidence.**

```text
12 breakpoint-tagged utility classes across 3 elements
lines: 14, 28, 47
hard-pixel measurements: w-[847px], w-[1230px]
```

**Why it matters.** Heavy per-element breakpoint logic is hard to
keep coherent — the next change at one breakpoint silently breaks
another. Hard-pixel widths bypass the type ramp entirely. Both
patterns surface frequently in agent-generated UI that pixel-pushed
its way to "looks right at this zoom".

**Suggested fix.** Move shared breakpoint logic up to a parent that
sets a layout context; let children inherit it. For widths, use the
spacing scale (`w-1/3`, `max-w-prose`) or container queries.

---

## Copy / IA Drift, frontend variant (`copy_ia_drift`)

**What it detects.** Multiple JSX strings naming the same
destination differently — e.g. one nav file using "Members" and a
breadcrumb using "Team". Reads the IA index to confirm the
destinations resolve to the same route.

**Example evidence.**

```text
2 labels for /workspace/members
src/nav/sidebar.tsx:14 → "Members"
src/routes/team/index.tsx:8 (breadcrumb) → "Team"
```

**Why it matters.** Copy drift makes the same area of the product
feel like two different places to users; agents picking up "fix the
copy on Team" can't tell which version is canonical. The detector
surfaces them as a *list* — picking the canonical wording is a
human call.

**Suggested fix.** Pick one canonical label and update all surfaces.
If both labels are legitimate (e.g. the nav label is short, the page
title is long), keep them deliberately and update the
`crimes.config.json` `ia.aliasGroups` entry so they no longer drift-
flag against each other.

---

## Visual Regression Review Hint (`visual_regression_review_hint`)

**What it detects.** Changed lines (in `crimes diff` or `--changed`
context) that touch JSX in ways the heuristics suspect will alter
the rendered output without obvious test coverage — typically style
edits or layout-tree restructuring.

**Example evidence.**

```text
changed lines: 14, 28-32, 47
edits include layout-affecting changes:
  flex-direction, grid-template, padding utilities
no visual regression test file detected for src/ui/PricingPage.tsx
```

**Why it matters.** Visual regressions are the silent failure mode
of agent-generated UI edits — a token-passing change that looks
green in unit tests but ships a broken page. The hint isn't a hard
"this is broken"; it's a flag for the reviewer that *manual visual
review or a snapshot test is worth doing here*.

**Suggested fix.** Skim the rendered page or add a snapshot /
visual-regression test before merging. The finding has no
remediation by itself — it's signal for the review queue.
