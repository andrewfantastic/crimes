# Petty Crimes Implementation Plan

Implementation plan for adding a "petty crimes" detector family to
`crimes`. This is a planning document, not a build artefact: nothing here
ships until a follow-up branch implements it. The authoritative product spec
stays `PRD.md`; the live milestone tracker stays `ROADMAP_STATUS.md`.

- **Repo state at planning time:** `crimes@0.3.0` release candidate on
  `main`. Built-in detectors cover local structure (`large_file`,
  `large_function`, `todo_density`, `direct_date`) and information
  architecture (`missing_agent_context`, `route_metadata_drift`,
  `duplicated_navigation_source`, `concept_alias_drift`,
  `docs_code_drift`).
- **Constraint:** petty crimes must not turn `crimes` into ESLint. They
  should surface small, evidence-backed maintainability irritants that
  increase change risk or agent confusion. Style-only findings are out of
  scope.
- **JSON compatibility:** do not add required fields and do not bump
  `schema_version` for the first release. "Petty" is a detector family and
  documentation category, not a new severity level.

---

## 1. Product framing

**Positioning.** _Small codebase irritants that make the next maintainer or
coding agent hesitate, guess, or copy the wrong thing._

Petty crimes are deliberately smaller than the existing structural and IA
findings:

- A structural crime says "this function/file is too large to change safely."
- An IA crime says "the repo gives competing answers about the same product
  concept."
- A petty crime says "this local pattern is small, but it makes the code
  easier to misread, cargo-cult, or preserve accidentally."

The category earns its place only when the finding helps answer the core
product question:

> Where is future change most likely to go wrong, and what should a human or
> coding agent know before editing it?

Examples that fit:

- Commented-out code that looks like an older implementation.
- Comments that carry rules not represented in code, tests, or config.
- Function names that imply safe/pure behaviour while the body performs side
  effects.
- Repeated domain literals that look like policy, status, plan, role, or
  route vocabulary.
- Tests that look present but assert little or nothing.

Examples that do not fit:

- Tabs vs spaces.
- Import ordering.
- Generic "prefer const" or semicolon rules.
- Every short variable name.
- Every console call.
- Any rule where the best answer is "turn on a linter".

### Why petty crimes matter to agents

Coding agents are sensitive to misleading local context. They copy nearby
patterns, trust comments more than they should, and often infer conventions
from one or two files. Petty crimes mark places where that inference is likely
to be wrong:

- Dead code in comments looks like available logic.
- Broad names like `data` and `payload` hide the shape an edit must preserve.
- Weak tests make an agent overestimate safety.
- Domain strings scattered across layers invite another copy instead of a
  source-of-truth edit.

The output should be playful in the human report but sober in JSON. Evidence
strings must remain concrete facts, not jokes.

---

## 2. Release goal

> Petty crimes add a low-noise category of small, deterministic
> maintainability findings that help humans and agents avoid misleading local
> context.

By the end of the first petty-crimes release, all of these should be true:

1. **Detector family documented.** README, agent docs, and JSON schema docs
   describe petty crimes as a category/tag in prose, not a schema-breaking
   field.
2. **At least three detectors ship.** Start with the highest-confidence
   findings: commented-out code, logic-bearing comments, and name/behaviour
   mismatch.
3. **No style-lint duplication.** Every detector must explain why the pattern
   creates change risk or agent risk beyond formatting or taste.
4. **Evidence-first findings.** Every finding includes literal comment text,
   identifier names, call names, string literals, or assertion counts that a
   reader can verify quickly.
5. **Conservative thresholds.** Petty findings default to `low` severity.
   `medium` is reserved for repeated or cross-file evidence. Petty crimes
   should almost never be `high`.
6. **Stable JSON contract.** Existing `Finding` shape remains sufficient.
   Detector IDs and charges carry the category:
   `commented_out_code` / "Commented-Out Corpse", etc.
7. **Fixture coverage.** `examples/messy-ts-app` demonstrates at least one
   finding from each shipped detector without overwhelming the sample output.
8. **Full workspace verification.** Run `pnpm ci` before declaring the
   implementation complete.

Out of scope for the first release: LLM-assisted comment understanding,
project-specific naming dictionaries, full duplicate-code detection,
dependency-graph-backed layer analysis, and auto-fixes.

---

## 3. Architecture

Petty crimes should reuse the existing detector shape:

```ts
export const detector: Detector = {
  id: "commented_out_code",
  name: "Commented-Out Corpse",
  description: "Finds disabled code left in comments.",
  run(ctx) {
    return [];
  },
};
```

No new runner is required. Add detectors to `builtInDetectors` after current
local structural detectors and before IA detectors:

1. Structural/file-local detectors.
2. Petty/file-local detectors.
3. IA/cross-file detectors.

This order keeps cheap local evidence first and preserves the current
cross-file IA block.

### Optional helper module

If two or more petty detectors need shared parsing helpers, add:

```text
packages/core/src/petty/
  comments.ts
  identifiers.ts
  literals.ts
  tests.ts
```

Keep helpers deterministic and language-pack-agnostic where possible. They
may consume `ctx.source`, `ctx.parsed`, and existing AST nodes, but `core`
must not import language-specific parser internals directly beyond what
`DetectorContext` already exposes.

### Human report category

Do not add a new required `Finding.category` field in the first release.
Instead:

- Use playful `charge` names.
- Group docs under `docs/finding-types/petty.md`.
- Optionally add a non-breaking reporter display convention later, such as
  printing "PETTY" when `Finding.type` is in a known petty detector set.

If a future release needs machine-readable categories, add optional
`category?: "structural" | "change_risk" | "duplication" | "testability" |
"domain" | "agent" | "ia" | "petty"` and document it as additive. That is not
needed for the first implementation.

---

## 4. Detector candidates

### 4.1 Commented-Out Corpse

**Type:** `commented_out_code`

**What it detects.** Comment blocks or consecutive line comments that appear
to contain disabled source code rather than prose.

**Why it matters.** Dead code in comments misleads future editors. Agents may
copy it, revive it, or preserve it as if it were documentation.

**MVP heuristic.**

1. Extract comments from source text. AST comment ranges are ideal if exposed;
   otherwise use a small scanner that handles `//`, `/* */`, and ignores
   string literals conservatively.
2. Consider only comment blocks with at least 3 non-empty lines or at least
   80 characters.
3. Strip comment markers and score code-likeness:
   - control keywords: `if`, `else`, `for`, `while`, `switch`, `try`, `catch`
   - declaration tokens: `const`, `let`, `var`, `function`, `class`, `import`,
     `export`, `interface`, `type`
   - syntax density: `{`, `}`, `=>`, `;`, `(`, `)`
   - call-like lines: `name(...)`
4. Fire when code-likeness crosses a threshold and the text does not look like
   a fenced Markdown example.

**Evidence examples.**

- `"Comment block spans 12 lines and contains 7 code-like statements"`
- `"Contains disabled tokens: const, if, await"`
- `"First disabled line: const user = await getUser(id);"`

**Severity.**

- `low`: one block.
- `medium`: multiple blocks in one file, or one block longer than 40 lines.

**Confidence.** `0.75` to `0.90` depending on syntax density.

**False-positive controls.**

- Ignore comments inside Markdown files.
- Ignore JSDoc examples marked `@example`.
- Ignore comments containing prose-heavy paragraphs with low syntax density.
- Ignore generated files.

**Suggested action.** Delete the disabled code or move the rationale into a
short comment that explains why the active implementation exists.

**Tests.**

- Detect consecutive `//` disabled implementation.
- Detect `/* */` disabled implementation.
- Ignore JSDoc prose and examples.
- Ignore URLs and issue snippets.

**Priority:** P0.

---

### 4.2 Logic in the Alibi

**Type:** `logic_in_comments`

**What it detects.** Comments that appear to encode business rules,
operational requirements, temporal coupling, or safety constraints that are
not obviously represented by adjacent code.

**Why it matters.** Hidden rules in prose are easy for agents and new
contributors to miss. If the comment is the only source of the rule, edits
are likely to violate it.

**MVP heuristic.**

1. Extract non-JSDoc comments near functions, conditionals, exports, and
   assignments.
2. Match rule-bearing language:
   - obligation: `must`, `never`, `always`, `only`, `required`, `forbidden`
   - exceptions: `unless`, `except`, `until`, `after`, `before`
   - safety: `do not`, `don't`, `cannot`, `can't`, `important`
   - domain words: `admin`, `owner`, `role`, `plan`, `tier`, `billing`,
     `payment`, `refund`, `timezone`, `UTC`, `cache`, `retry`, `idempotent`
3. Compare nearby code window for matching tokens. Fire only when the comment
   has at least two rule signals and at least one domain signal.
4. Increase confidence if the comment is immediately above a broad function
   or branch and the body contains no corresponding identifier/literal tokens.

**Evidence examples.**

- `"Comment says \"Only owners can refund annual plans\""`
- `"Rule-bearing terms: only, owners, refund, plans"`
- `"Adjacent function body does not reference owner/role checks"`

**Severity.**

- `low`: one local comment.
- `medium`: repeated rule-bearing comments in the same file or comment near
  exported function/API route.

**Confidence.** `0.55` to `0.75`. This detector should be humbly worded:
"comment appears to carry a rule".

**False-positive controls.**

- Do not flag comments that clearly explain algorithmic context without
  policy language.
- Do not flag TODOs already covered by `todo_density`.
- Do not flag comments where nearby code contains matching guard identifiers.

**Suggested action.** Encode the rule in a named guard, type, config value, or
test; keep the comment only for rationale.

**Tests.**

- Detect owner/plan rule in comment above a function.
- Ignore normal explanatory comments.
- Ignore comments whose tokens match a nearby guard.
- Detect temporal ordering comments like "call initialise before sync".

**Priority:** P0.

---

### 4.3 False Identity

**Type:** `name_behavior_mismatch`

**What it detects.** Functions whose names imply pure, safe, or read-only
behaviour while their bodies perform side effects.

**Why it matters.** Agents and humans use names to decide whether a call is
safe to move, duplicate, cache, or run in tests. A misleading name creates
real change risk.

**MVP heuristic.**

1. Inspect function declarations, function expressions, arrow functions
   assigned to identifiers, and exported methods.
2. Identify low-risk/pure-sounding name prefixes:
   - `get`, `find`, `read`, `select`
   - `is`, `has`, `can`, `should`
   - `build`, `format`, `render`, `calculate`, `derive`, `parse`
3. Score side-effect evidence in the body:
   - `await` calls to names containing `save`, `create`, `update`, `delete`,
     `insert`, `send`, `emit`, `publish`, `track`, `charge`, `refund`,
     `write`, `set`
   - assignments to outer-scope variables or object properties
   - calls on known side-effect globals/APIs: `fetch`, `localStorage`,
     `sessionStorage`, `process.env` writes, filesystem methods, database-like
     clients
4. Fire only when pure-sounding name + at least two side-effect signals, or
   one strong domain side effect such as `charge`, `refund`, `delete`,
   `sendEmail`.

**Evidence examples.**

- `"Function name \"calculateInvoice\" suggests a calculation"`
- `"Body awaits saveInvoice() and sendInvoiceEmail()"`
- `"Contains 3 side-effect-like calls"`

**Severity.**

- `low`: local/non-exported function.
- `medium`: exported function or React hook used across files.

**Confidence.** `0.65` to `0.85`.

**False-positive controls.**

- Allow configurable ignored prefixes later, but not in MVP.
- Do not flag `getOrCreate*`; the name discloses mutation.
- Do not flag test files unless the function is exported from fixtures used by
  production code.
- Do not flag when side-effect calls are inside clearly named nested helper
  declarations that are not invoked.

**Suggested action.** Rename the function to disclose the side effect, or
extract the pure calculation/read part from the mutation.

**Tests.**

- Detect `calculateInvoice` that saves and emails.
- Ignore `getOrCreateUser`.
- Ignore pure `formatDate`.
- Detect exported mismatch with higher severity.

**Priority:** P0.

---

### 4.4 String Sprinkles

**Type:** `magic_domain_literal_scatter`

**What it detects.** Repeated domain literals spread across unrelated files or
layers without an obvious source of truth.

**Why it matters.** Repeated plan names, role names, statuses, feature flags,
analytics events, and route/action labels often turn into duplicated policy.
Agents tend to add one more copy.

**MVP heuristic.**

1. Extract string literals from parsed JS/TS files.
2. Ignore:
   - short strings under 3 chars
   - import specifiers and module paths
   - test descriptions
   - CSS className-heavy strings
   - obvious prose longer than 80 chars
3. Keep literals that look domain-like:
   - uppercase enum-ish: `ACTIVE`, `PAST_DUE`
   - kebab/snake/dot keys: `billing.refund.created`
   - role/plan/status/action words from a small seed list
4. Fire when the same literal appears in at least 3 files across at least 2
   top-level directories and no nearby exported constant with the same value
   is detected.

**Evidence examples.**

- `"Literal \"enterprise\" appears in 5 files across src/ui and src/api"`
- `"Representative files: src/ui/Pricing.tsx, src/api/billing.ts, src/jobs/sync.ts"`

**Severity.**

- `low`: repeated in 3-4 files.
- `medium`: repeated in 5+ files or crosses UI/API/job boundaries.

**Confidence.** `0.70` to `0.85`.

**False-positive controls.**

- Skip tests by default for counting, but include test files in related files
  if production code also repeats the literal.
- Skip generated lock/data files.
- Skip literals that are already exported constants or enum members.

**Suggested action.** Move the domain literal to a named constant, enum,
schema, route registry, analytics registry, or policy module.

**Tests.**

- Detect status repeated across UI/API/job files.
- Ignore import paths and class names.
- Ignore repeated test names.
- Ignore values already represented by a shared constant.

**Priority:** P1. This overlaps future duplication work, so keep scope narrow.

---

### 4.5 Test That Proves Nothing

**Type:** `weak_test_signal`

**What it detects.** Test blocks that look present but have no meaningful
assertions.

**Why it matters.** Weak tests inflate confidence. Agents may edit risky code
because a nearby test exists, even though it does not protect behaviour.

**MVP heuristic.**

1. Inspect files matching common test patterns:
   `.test.`, `.spec.`, `__tests__`.
2. Find `it(...)` / `test(...)` blocks.
3. Count assertion signals:
   - `expect(...)`
   - `assert.*`
   - framework-specific calls already used in the repo
4. Flag blocks with no assertions unless they return/await a known assertion
   helper.
5. Flag blocks with only weak assertions:
   - `toBeDefined`
   - `toBeTruthy`
   - `toBeFalsy`
   - snapshots only, if no other assertion exists

**Evidence examples.**

- `"Test \"renders billing page\" contains no expect/assert calls"`
- `"Test has 1 assertion and it is only toBeTruthy()"`

**Severity.**

- `low`: weak assertion.
- `medium`: no assertions in multiple test blocks in one file.

**Confidence.** `0.75` to `0.90`.

**False-positive controls.**

- Ignore compile-only type tests if named `typecheck`, `tsd`, or similar.
- Ignore tests that explicitly use callback-style failure channels only when
  a known framework pattern is present.
- Keep framework support small at first: Vitest/Jest-style syntax.

**Suggested action.** Assert the observable behaviour the test is meant to
protect, or delete the test if it is only exercising setup.

**Tests.**

- Detect empty Vitest/Jest test.
- Detect only `toBeTruthy`.
- Ignore meaningful equality assertion.
- Ignore type-level test fixture if applicable.

**Priority:** P1.

---

### 4.6 Option Bag Junk Drawer

**Type:** `option_bag_junk_drawer`

**What it detects.** Broad objects named `options`, `config`, `payload`,
`data`, `params`, or `meta` that are passed through multiple functions and
read inconsistently.

**Why it matters.** Broad bags hide required shape. Agents add fields or
rename properties without understanding the implicit contract.

**MVP heuristic.**

- File-local first: detect a generic object parameter with 6+ distinct
  property reads in one function, or the same generic object passed to 3+
  helpers.
- Later cross-file version can track exported type/property usage.

**Priority:** P2.

---

### 4.7 Return Shape Roulette

**Type:** `return_shape_roulette`

**What it detects.** Functions that return object literals with substantially
different property sets across branches.

**Why it matters.** Callers and agents infer the wrong shape unless types are
strict and explicit.

**MVP heuristic.**

- Inspect functions with 3+ object-literal returns.
- Compute property-set overlap.
- Fire when at least two branches share less than 50% of keys and return type
  is absent or broad.

**Priority:** P2.

---

### 4.8 Negative Flag Maze

**Type:** `negative_flag_maze`

**What it detects.** Predicates with multiple negated flag names:
`!disableX && !skipY || noZ`.

**Why it matters.** Double-negative conditionals are easy to invert during
maintenance.

**MVP heuristic.**

- Detect branch predicates with 2+ identifiers starting with `no`, `not`,
  `disable`, `disabled`, `skip`, `without`, combined with `!` or `!==`.

**Priority:** P3. This edges closer to lint, so only ship if evidence from
real repos shows value.

---

## 5. Implementation sequence

### Phase 0: Scope guardrails

1. Add this plan.
2. Add a short `ROADMAP_STATUS.md` note listing petty crimes as proposed, not
   shipped.
3. Decide whether the first implementation release should be `0.4.0` or later
   based on the dependency/duplication roadmap.

Exit criteria: the team agrees petty crimes are agent-risk signals, not style
rules.

### Phase 1: Shared comment extraction

Files:

- `packages/core/src/petty/comments.ts`
- `packages/core/src/petty/comments.test.ts`

Build a conservative comment scanner:

- preserve line numbers
- support line and block comments
- avoid matching comment-like text inside strings/templates when feasible
- expose normalized text, raw text, start/end lines, and comment kind

Exit criteria: scanner unit tests cover ordinary comments, block comments,
URLs, strings containing `//`, and template literals.

### Phase 2: P0 detectors

Files:

- `packages/core/src/detectors/commented-out-code.ts`
- `packages/core/src/detectors/commented-out-code.test.ts`
- `packages/core/src/detectors/logic-in-comments.ts`
- `packages/core/src/detectors/logic-in-comments.test.ts`
- `packages/core/src/detectors/name-behavior-mismatch.ts`
- `packages/core/src/detectors/name-behavior-mismatch.test.ts`
- `packages/core/src/scan.ts`
- `packages/core/src/index.ts`

Implement P0 detectors behind normal built-in registration. Keep all findings
`low` or `medium`.

Exit criteria:

- Unit tests pass.
- Running `crimes scan` on this repo produces no noisy wall of petty findings.
- Every detector has evidence that quotes concrete observed facts.

### Phase 3: Fixture and docs

Files:

- `examples/messy-ts-app/src/...`
- `docs/finding-types/petty.md`
- `docs/agent-usage.md`
- `docs/json-schema.md`
- `README.md`
- `ROADMAP_STATUS.md`
- `docs/fixtures/messy-ts-app.json`

Add fixture examples that are realistic but small. Regenerate sample JSON from
a real scan, not by hand.

Exit criteria:

- Fixture emits at least one finding from each P0 detector.
- Docs explain false positives and suggested human/agent responses.
- README lists petty crimes separately from structural and IA detectors.

### Phase 4: P1 detectors

Implement only after P0 detectors are quiet:

- `magic_domain_literal_scatter`
- `weak_test_signal`

Exit criteria:

- Repeated literal detector does not flood the repo with class names, import
  paths, test names, or prose.
- Weak-test detector avoids type-only tests and framework setup blocks.

### Phase 5: Tuning on real repos

Run against:

- this repo
- `examples/messy-ts-app`
- at least two external TS/JS repos checked out locally
- one React app with tests
- one Node package without a frontend

Record:

- finding count by detector
- top false positives
- whether any detector should remain disabled/deferred

Exit criteria: P0 detectors average low single-digit findings on healthy repos
and produce obvious receipts on messy repos.

---

## 6. Scoring and severity

Petty crimes should be useful without dominating reports.

Recommended defaults:

| Detector | Default severity | Max severity | Agent risk |
| --- | --- | --- | --- |
| `commented_out_code` | low | medium | 0.45-0.70 |
| `logic_in_comments` | low | medium | 0.55-0.80 |
| `name_behavior_mismatch` | low | medium | 0.60-0.85 |
| `magic_domain_literal_scatter` | low | medium | 0.55-0.80 |
| `weak_test_signal` | low | medium | 0.50-0.75 |

General rules:

- Petty findings should not be `high` in the first release.
- Confidence must be lower when semantics are inferred from words.
- Agent risk may be higher than severity when the pattern is especially
  misleading to a coding agent.
- Cap each petty detector per scan if needed. A noisy detector is a disabled
  detector.

---

## 7. Reporting and docs language

Use playful charges, but keep summaries precise:

- Good: `"Comment block appears to contain disabled code that an editor may mistake for documentation."`
- Bad: `"This file is haunted by old code."`

Human docs should include:

- what the detector reads
- why it matters for humans
- why it matters for agents
- false positives
- suggested response
- example JSON finding

Agent guidance should say:

- read the evidence first
- do not auto-delete or rename without understanding intent
- prefer encoding hidden rules in tests/types/config
- treat weak tests as lower confidence, not as proof that code is broken

---

## 8. Open questions

1. Should petty crimes be enabled by default immediately, or introduced behind
   a config flag until tuned on real repos?
2. Should the human reporter visually group petty findings, or is the charge
   name enough for the first release?
3. Should `todo_density` be reclassified as a petty crime in docs, or remain a
   structural/testability detector?
4. How aggressive should repeated literal detection be before dependency and
   duplication detectors exist?
5. Should docs examples use deliberately funny charges, or stay closer to the
   existing sober tone?

---

## 9. Recommended first implementation slice

Ship a focused first slice:

1. `commented_out_code`
2. `logic_in_comments`
3. `name_behavior_mismatch`
4. `docs/finding-types/petty.md`
5. Fixture examples and regenerated sample JSON

Defer repeated literals and weak tests until the first three have been tuned.
This keeps the category distinctive without turning the default scan into a
large list of minor annoyances.
