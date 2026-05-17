import type { ParsedFile } from "@crimes/language-js";
import type { CrimesConfig } from "./config.js";
import type { Finding } from "./finding.js";
import type { IaIndex } from "./ia/types.js";
import type { ImportGraph } from "./imports/types.js";
import type { JsxShapeIndex } from "./jsx/shape-index.js";
import type { PettyIndex } from "./petty/types.js";
import type { ScoringContext } from "./scoring/build.js";

/**
 * A detector inspects parsed files and emits zero or more findings.
 *
 * Detectors are stateless and safe to call in parallel. They must not
 * write to disk or perform network I/O.
 */
export interface Detector {
  /** Stable machine id, e.g. `large_function`. */
  id: string;
  /** Short human-friendly name shown in `--list-detectors` later. */
  name: string;
  /** One-line description of what this detector finds. */
  description: string;
  /**
   * One-paragraph rationale for `crimes explain`. Explains _why_ this kind
   * of finding matters to agents and reviewers, not what the detector
   * looks for (that is `description`). Deterministic — no LLM, no
   * per-finding tailoring; the same string is shown for every finding of
   * this type.
   */
  whyItMatters: string;
  run(ctx: DetectorContext): Promise<Finding[]> | Finding[];
}

export interface DetectorContext {
  /** Repo-relative path with forward slashes. */
  file: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Raw file source. */
  source: string;
  /** Lazy-parsed TS/JS AST + metadata. */
  parsed: ParsedFile;
  /** Resolved config (already merged with defaults). */
  config: CrimesConfig;
  /**
   * Optional repo-level IA signal index. Populated by `scan` and `context`
   * for every detector context; absent only in direct unit-test stubs that
   * don't need cross-file analysis. IA detectors read from this; existing
   * file-local detectors ignore it.
   */
  ia?: IaIndex;
  /**
   * Optional repo-level petty-crimes signal index. Populated by `scan` and
   * `context`; absent only in direct unit-test stubs or when the index build
   * fails. Cross-file petty detectors read from this.
   */
  petty?: PettyIndex;
  /**
   * Optional repo-level import graph. Populated by `scan` and `context` for
   * every detector context; absent only in direct unit-test stubs that
   * don't exercise cross-file dependency analysis. Dependency-graph
   * detectors (`circular_dependency`, `deep_import`,
   * `high_fan_in_fan_out`), `layer_violation`, and `scores.blast_radius`
   * read from this; file-local detectors ignore it.
   */
  imports?: ImportGraph;
  /**
   * Optional repo-wide JSX shape index. Populated by `scan` and
   * `context`; absent only in stubs that don't exercise the
   * `duplicate_component_shape` detector. The index groups
   * "interesting" JSX subtrees by their structural shape hash so the
   * detector can answer "does this shape appear in ≥3 distinct files?"
   * without re-walking every file itself.
   */
  jsxShapeIndex?: JsxShapeIndex;
  /**
   * Optional per-file scoring context. Populated by `scan` and `context`;
   * absent in direct unit-test stubs. Core uses this to backfill
   * `scores.churn` / `scores.test_gap` / `scores.blast_radius` and to
   * recompute `scores.agent_risk` on every finding via the unified
   * 0.6.0 formula. Detectors do not need to read it themselves —
   * finalisation happens after `run()` returns — but it is exposed
   * here for advanced detectors that want to gate behaviour on the
   * scoring signal (e.g. `visual_regression_review_hint`).
   */
  scoring?: ScoringContext;
}
