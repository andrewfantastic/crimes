# `crimes.config.json` reference

Zero-config works for most repos. Use `crimes.config.json` only when the
defaults are wrong for your repo — tuning thresholds, disabling
detectors that don't apply, seeding product-specific concept aliases.

The config lives at the repo root as `crimes.config.json`. The
`.crimes/` directory next to it is a tooling output directory
(baseline, suppressions, cache); the config is hand-edited.

## Bootstrap

```bash
npx crimes init
```

Writes a starter `crimes.config.json` with sensible defaults and an
inline `$schema` URL for IDE validation. Refuses to overwrite an
existing file unless you pass `--force`.

To also make `crimes` discoverable to future Claude Code and Codex
sessions in the repo:

```bash
npx crimes init --agents
```

That writes `.claude/skills/crimes/SKILL.md` and
`.agents/skills/crimes/SKILL.md` alongside the config.

## Shape

```jsonc
{
  "$schema": "https://crimes.sh/schema/0.1.0/config.json",

  "include": ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.generated.*",
    "**/.crimes/**"
  ],

  "thresholds": {
    "largeFileLines": 300,
    "largeFunctionLines": 60,
    "todoDensityPerKLoc": 10,
    "largeFunction": {
      "domain": 60,
      "route_handler": 100,
      "react_component": 200,
      "page_export": 200,
      "test_callback": 200,
      "cli_command_registrar": 200,
      "unknown": 80
    },
    "largeFile": {
      "domain": 300,
      "test_file": 1500
    }
  },

  "detectors": {
    "enable": [],
    "disable": []
  },

  "ia": {
    "aliasGroups": []
  },

  "suppressions": {
    "path": ".crimes/suppressions.json"
  },

  "architecture": {
    "layers": [],
    "rules": []
  }
}
```

Every key is optional. Missing keys take the defaults documented in
`packages/core/src/config.ts`.

## Field reference

### `$schema`

Optional URL pointing at the JSON schema. Parsed but not consumed by
the CLI — there only for IDE validation.

### `include` / `exclude`

Glob patterns the file walker honours. The included paths must match
**and** the excluded patterns must not match. Identical defaults to
`crimes init`.

### `thresholds.largeFileLines` / `largeFunctionLines` / `todoDensityPerKLoc`

The original three knobs. `largeFunctionLines` is the **domain**
function threshold; it stays the back-compat alias for the per-shape
override below.

### `thresholds.largeFunction.<shape>`

Per-shape `large_function` overrides. Any subset is fine — unset shapes
use the built-in defaults:

| Shape                   | Default threshold |
| ----------------------- | ----------------- |
| `domain`                | 60                |
| `route_handler`         | 100               |
| `react_component`       | 200               |
| `page_export`           | 200               |
| `test_callback`         | 200               |
| `cli_command_registrar` | 200               |
| `unknown`               | 80                |

The `cli_command_registrar` shape (new in 0.6.0) covers Commander-
style `register*Command(program)` wrapper functions and their
anonymous `.action(...)` callbacks. The chain is declarative DSL,
not branching logic, so the threshold is generous and severity caps
at `low` / `medium`.

`thresholds.largeFunction.domain` wins over the legacy
`thresholds.largeFunctionLines` when both are set.

### `thresholds.largeFile.<shape>`

Per-shape `large_file` overrides (new in 0.6.0). Any subset is fine
— unset shapes use the built-in defaults:

| Shape       | Default threshold |
| ----------- | ----------------- |
| `domain`    | 300               |
| `test_file` | 1500              |

The `test_file` shape matches `**/*.{test,spec}.[jt]sx?` and files
under `__tests__/`. Test suites legitimately grow large with many
small `it()` blocks, so the budget is much higher and severity caps
at `low` / `medium`.

`thresholds.largeFile.domain` wins over the legacy
`thresholds.largeFileLines` when both are set.

### `thresholds.assetWeight`

Severity thresholds for `oversized_raster` (new in 0.8.0). Sizes
are in KB (1 KB = 1024 bytes); any subset is fine — unset levels
use the built-in defaults:

| Knob       | Default |
| ---------- | ------- |
| `lowKb`    | 200     |
| `mediumKb` | 500     |
| `highKb`   | 1000    |

The severity rule: bytes below `lowKb` produce no finding;
`[lowKb, mediumKb)` is `low`; `[mediumKb, highKb)` is `medium`;
≥ `highKb` is `high`. Defaults mirror Core Web Vitals "good /
needs improvement / poor" guidance for content images.

### `assets.include` / `assets.exclude`

Asset-file discovery overrides for the second-pass detectors
(`oversized_raster`, `raster_should_be_vector`,
`svg_with_embedded_raster`). Independent of the top-level
`include` / `exclude` so users can tune asset scope without
touching source scope. Defaults:

```jsonc
{
  "assets": {
    "include": ["**/*.{png,jpg,jpeg,gif,webp,avif,svg}"],
    "exclude": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/.crimes/**",
      "**/public/vendor/**",
      "**/__snapshots__/**",
      "**/fixtures/**",
      "**/*.test.{png,jpg,jpeg,gif,webp,avif,svg}"
    ]
  }
}
```

Setting `assets.include` to an empty list disables the asset pass
entirely.

### `detectors.enable` / `detectors.disable`

- `enable` is an allowlist. Empty or omitted means "run all built-ins".
  When non-empty, only the listed ids run.
- `disable` is a blocklist that runs **after** `enable`.
- An unknown detector id in either list raises a CLI error (exit `2`)
  — typos should not silently no-op. See the table in
  [`json-schema.md`](./json-schema.md#type) for the full list of ids.

**Anti-pattern:** disabling a detector is a blunt tool. Prefer
suppressing specific findings with `crimes ignore` plus a reason.
Reserve `disable` for detectors that fundamentally don't fit your
repo (`todo_density` on a research codebase where TODO is a tracking
convention, not debt).

### `detectors.options`

Per-detector exemption values. Sits between `detectors.disable`
(kills the detector everywhere) and `crimes ignore` (kills one
specific finding) — `detectors.options.<id>` lets you say "this
value is fine for this detector across the whole codebase, but
keep firing on others."

```jsonc
{
  "detectors": {
    "options": {
      "boolean_naming_drift": {
        "allowedNames": ["loading", "ready"]
      },
      "magic_domain_literal_scatter": {
        "allowedLiterals": ["draft", "published"]
      }
    }
  }
}
```

Each detector that accepts options declares its own schema; the
config loader validates supplied options against the schema at
load time. Three failure modes — all CLI exit `2`
(`ConfigParseError`):

1. `detectors.options.<id>`: unknown detector id — the id doesn't
   match any built-in.
2. `detectors.options.<id>`: this detector accepts no options —
   the id is real but the detector has not registered any options
   schema.
3. `detectors.options.<id>`: ... — the value's shape doesn't
   match the detector's declared options.

The keys each detector understands are documented alongside that
detector under [`finding-types/`](./finding-types/). Detectors
that don't appear in those docs accept no options.

### `ia.aliasGroups`

Seed entries for `concept_alias_drift`. Each group is `{ id,
aliases[], preferred? }` with lowercase, singular tokens. Always
**additive** to the built-in `DEFAULT_ALIAS_GROUPS`.

```jsonc
{
  "ia": {
    "aliasGroups": [
      { "id": "dataset", "aliases": ["dataset", "corpus", "collection"] }
    ]
  }
}
```

### `suppressions.path`

Override the on-disk suppressions file path. Defaults to
`.crimes/suppressions.json`. Relative paths resolve against the repo
root; absolute paths win unchanged. See
[`suppressions.md`](./suppressions.md).

### `architecture` (consumed by `layer_violation` since 0.6.0)

Defines named layers by file glob and explicit
`from → cannotImport` rules. The `layer_violation` detector consumes
both fields and emits one finding per imported file that crosses a
forbidden boundary.

```jsonc
{
  "architecture": {
    "layers": [
      { "name": "ui",     "pattern": "src/components/**" },
      { "name": "domain", "pattern": "src/domain/**" },
      { "name": "db",     "pattern": "src/db/**" }
    ],
    "rules": [
      { "from": "ui",     "cannotImport": ["db", "domain"] },
      { "from": "domain", "cannotImport": ["ui"] }
    ]
  }
}
```

`pattern` is a glob matched against repo-relative POSIX paths.
`from` and `cannotImport[]` reference layers by `name`. Layers that
don't appear in any rule are still useful as documentation; the
detector only emits findings when a `cannotImport` is violated.

See [`docs/finding-types/dependency.md`](./finding-types/dependency.md)
for the full detector contract and `PRD.md` §18 for the design intent.

## Worked examples

### Add a product-specific alias group

```jsonc
{
  "ia": {
    "aliasGroups": [
      { "id": "tenant", "aliases": ["tenant", "company", "org", "organization"] }
    ]
  }
}
```

### Tune `large_function` for a route-heavy app

```jsonc
{
  "thresholds": {
    "largeFunction": {
      "route_handler": 150
    }
  }
}
```

### Disable a detector that doesn't apply

```jsonc
{
  "detectors": {
    "disable": ["todo_density"]
  }
}
```

### Move the suppressions file out of `.crimes/`

```jsonc
{
  "suppressions": {
    "path": "config/crimes-suppressions.json"
  }
}
```

## Validation errors

The CLI validates the file with `zod`. A malformed value prints the
exact key path that failed and exits `2`:

```
crimes: crimes.config.json at .../crimes.config.json is invalid:
thresholds.largeFileLines: Expected number, received string
```

Unknown top-level keys are preserved silently — `crimes` may extend
the schema in future releases without breaking older config files.
