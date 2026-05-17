import type { ParsedFile } from "@crimes/language-js";
import type { CrimesConfig } from "./config.js";
import type { Finding } from "./finding.js";
import type { IaIndex } from "./ia/types.js";
import type { PettyIndex } from "./petty/types.js";

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
}
