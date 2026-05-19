# Contributing to crimes

Thanks for considering a contribution! `crimes` is intentionally small at the moment, so the bar for "useful contribution" is low.

## Quick setup

```bash
git clone https://github.com/ortomate/crimes.git
cd crimes
pnpm install
pnpm build
pnpm test
```

If `pnpm scan:example` produces a "CRIME SCENE REPORT" with a handful of findings, you have a working dev environment.

## Project shape

This is a **pnpm workspace monorepo**:

| Package                | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `packages/cli`         | The `crimes` binary (Commander)                                 |
| `packages/core`        | Detector contract, finding schema, scan orchestration           |
| `packages/language-js` | TS/JS file discovery and AST parsing                            |
| `packages/reporter`    | Human-readable and JSON output formatters                       |
| `apps/website`         | `crimes.sh` placeholder; replaced by Astro/Next.js later        |
| `examples/messy-ts-app`| Intentionally crime-ridden fixture used by smoke tests          |

## Adding a new detector

1. Create `packages/core/src/detectors/your-detector.ts`. Export a `Detector`:

   ```ts
   import type { Detector } from "../detector.js";
   import type { Finding } from "../finding.js";

   export const yourDetector: Detector = {
     id: "your_detector",
     name: "Your Detector",
     description: "What it finds, in one sentence.",
     run(ctx) {
       const findings: Finding[] = [];
       // inspect ctx.source / ctx.parsed / ctx.config
       return findings;
     },
   };
   ```

2. Export it from `packages/core/src/index.ts` **and** add it to `builtInDetectors` in `packages/core/src/scan.ts`.

3. Add a Vitest unit test next to your detector file (`your-detector.test.ts`).

4. If the example fixture doesn't already trigger your detector, add a small file under `examples/messy-ts-app/src/` that does.

Detector design rules:

- Findings must include concrete **evidence** strings — facts a reader can verify.
- `confidence` is honest: don't claim 1.0 unless you literally cannot be wrong.
- No I/O. Detectors run against `ctx.source` and `ctx.parsed`.
- Keep heuristics conservative. A noisy detector is a disabled detector.

## Adding a new language

Create `packages/language-<lang>` alongside `language-js`, expose the same shape (`discoverFiles`, `parseFile`), and wire it up in `scan.ts`. We'll formalise a registry once we have a second language to compare against.

## Running checks locally

```bash
pnpm typecheck   # tsc --noEmit everywhere
pnpm test        # vitest run everywhere
pnpm build       # tsup everywhere
```

CI runs the same on Node 20 and Node 22.

## Commit style

Prefix commits with the affected area when it's obvious:

```
core: add deep-nesting detector
cli: add --no-color flag
language-js: improve arrow-function name inference
```

Not required, just helpful.

## License

By contributing, you agree your contribution is released under the [MIT License](./LICENSE).
