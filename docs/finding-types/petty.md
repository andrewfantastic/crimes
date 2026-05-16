# Petty Crimes findings

Petty crimes flag small codebase irritants that make the next maintainer or
coding agent hesitate, guess, or copy the wrong thing. They are intentionally
smaller than structural crimes and IA crimes: the point is not that one
comment or one misleading name is catastrophic, but that these patterns create
misleading local context.

This page is the long-form reference for the petty finding types shipped on
`main`. For the wire format, see [`docs/json-schema.md`](../json-schema.md).
For the agent workflow that consumes findings, see
[`docs/agent-usage.md`](../agent-usage.md).

## What ships

| `Finding.type`           | Charge                 | Severity range | Confidence |
| ------------------------ | ---------------------- | -------------- | ---------- |
| `commented_out_code`     | Commented-Out Corpse   | low-medium     | 0.75-0.90  |
| `logic_in_comments`      | Logic in the Alibi     | low-medium     | 0.55-0.76  |
| `name_behavior_mismatch` | False Identity         | low-medium     | 0.65-0.86  |

All three emit the existing `Finding` shape. No schema bump is required:
petty crimes are a detector family, not a new severity level or required
field.

---

## Commented-Out Corpse

**What it detects.** Comment blocks or consecutive line comments that appear
to contain disabled source code rather than prose.

**Example evidence.**

```text
5 comment lines
code-like tokens: const, if, await
first code-like line: const legacyRefund = await loadRefund(user.id);
```

**Why it matters.** Dead code in comments is not harmless context. Humans and
agents can copy it, revive it, or preserve it as if it were documentation,
even though it may describe an older implementation.

**Suggested fix.** Delete the disabled code. If the old behaviour matters,
replace it with a short rationale that explains why the active code is shaped
the way it is.

**False-positive notes.**

- JSDoc blocks and `@example` examples are ignored.
- Markdown fenced examples are ignored.
- Short prose comments are ignored; the detector needs enough syntax-like
  evidence to fire.

---

## Logic in the Alibi

**What it detects.** Comments that appear to encode business rules,
operational requirements, temporal coupling, or safety constraints that are
not obviously represented by nearby code.

**Example evidence.**

```text
comment says: "Only owners can refund enterprise plans unless billing support approves."
rule terms: only, unless
domain terms not found nearby: owners, refund, plan
```

**Why it matters.** Prose-only rules are easy to miss. An agent may edit the
function body and never encode the owner/plan/billing constraint because the
rule was not represented as a guard, type, config value, or test.

**Suggested fix.** Move the rule into a named guard, type, config value, or
test. Keep comments for rationale, not as the only source of behavioural
truth.

**False-positive notes.**

- TODO/FIXME/HACK comments are handled by `todo_density`, not this detector.
- Comments whose domain terms appear in nearby guard code are ignored.
- This detector is semantic-adjacent by nature, so summaries use "appears to"
  language and confidence stays modest.

---

## False Identity

**What it detects.** Functions whose names imply safe, read-only, or pure
behaviour while their bodies perform side effects.

**Example evidence.**

```text
name prefix suggests a pure transformation
side-effect-like calls: saveRefundAudit, sendRefundEmail
2 side-effect signals in the function body
```

**Why it matters.** Humans and agents use names to decide whether a function
is safe to move, duplicate, cache, or call in tests. A `calculate*` function
that writes audit records and sends email is easy to misuse.

**Suggested fix.** Rename the function to disclose the side effect, or extract
the pure calculation/read part from the mutation.

**False-positive notes.**

- Names that disclose mutation, such as `getOrCreate*`, are ignored.
- Test files are ignored.
- The detector requires multiple side-effect signals, or one strong domain
  side effect, before it fires.
