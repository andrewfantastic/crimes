import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Default path the suppressions file lives at, relative to the repo root.
 * Mirrors `.crimes/baseline.json`: same parent directory, intended to be
 * committed, hand-reviewable in PRs.
 */
export const DEFAULT_SUPPRESSIONS_PATH = ".crimes/suppressions.json";

/**
 * `crimes.config.json` shape. All fields are optional and back-compat —
 * a config from `crimes@0.4.0` keeps loading unchanged, and a config that
 * sets only the new fields keeps the existing defaults for the rest.
 */
export interface CrimesConfig {
  /** Optional `$schema` URL for IDE validation. Parsed but otherwise ignored. */
  $schema?: string;
  include: string[];
  exclude: string[];
  thresholds: {
    largeFileLines: number;
    largeFunctionLines: number;
    todoDensityPerKLoc: number;
    /**
     * Per-shape `large_function` overrides. Any subset is fine — unset
     * shapes use the built-in defaults documented in
     * `packages/core/src/detectors/large-function.ts`.
     *
     * The `domain` entry wins over the legacy top-level
     * `thresholds.largeFunctionLines` when both are set.
     */
    largeFunction?: {
      domain?: number;
      route_handler?: number;
      react_component?: number;
      page_export?: number;
      test_callback?: number;
      cli_command_registrar?: number;
      unknown?: number;
    };
    /**
     * Per-shape `large_file` overrides. Any subset is fine — unset shapes
     * use the built-in defaults documented in
     * `packages/core/src/detectors/large-file.ts`.
     *
     * The `domain` entry wins over the legacy top-level
     * `thresholds.largeFileLines` when both are set.
     */
    largeFile?: {
      domain?: number;
      test_file?: number;
    };
  };
  /**
   * IA seed overrides. Always **additive** to
   * `DEFAULT_ALIAS_GROUPS` from `packages/core/src/ia/aliases.ts`. A future
   * `aliasGroupsReplace: true` opt-in could replace the built-in list.
   */
  ia?: {
    aliasGroups?: Array<{
      id: string;
      aliases: string[];
      preferred?: string;
    }>;
  };
  /**
   * Detector toggles. `enable` is an allowlist (empty/omitted means all
   * built-ins). `disable` is a blocklist that runs **after** `enable`.
   */
  detectors?: {
    enable?: string[];
    disable?: string[];
  };
  /** Suppression file path override. Defaults to `.crimes/suppressions.json`. */
  suppressions?: {
    path?: string;
  };
  /**
   * Reserved — schema-validated but not consumed in 0.5.0. The shape
   * mirrors `PRD.md` §18 so the eventual implementation doesn't have to
   * rev the schema again.
   */
  architecture?: {
    layers?: Array<{ name: string; pattern: string }>;
    rules?: Array<{ from: string; cannotImport: string[] }>;
  };
}

export const DEFAULT_CONFIG: CrimesConfig = {
  include: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.generated.*",
    "**/.crimes/**",
  ],
  thresholds: {
    largeFileLines: 300,
    largeFunctionLines: 60,
    todoDensityPerKLoc: 10,
  },
};

/**
 * One advisory issue surfaced while loading a config. Unknown keys are
 * silently merged today, so no warnings are produced — `issues` exists
 * for future soft-warning use (deprecated keys, conflicting overrides).
 */
export interface ConfigIssue {
  severity: "warning";
  message: string;
}

export interface LoadConfigResult {
  config: CrimesConfig;
  issues: ConfigIssue[];
  /** Absolute path that was read, or `undefined` when no file exists. */
  path?: string;
}

/**
 * Raised when `crimes.config.json` is present but unreadable or
 * structurally invalid. The CLI maps this to exit-code 2 with the
 * single-line message produced here.
 */
export class ConfigParseError extends Error {
  path: string;
  constructor(path: string, reason: string) {
    super(`crimes.config.json at ${path} is invalid: ${reason}`);
    this.name = "ConfigParseError";
    this.path = path;
  }
}

const aliasGroupSchema = z.object({
  id: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  preferred: z.string().min(1).optional(),
});

const largeFunctionShapesSchema = z
  .object({
    domain: z.number().int().positive().optional(),
    route_handler: z.number().int().positive().optional(),
    react_component: z.number().int().positive().optional(),
    page_export: z.number().int().positive().optional(),
    test_callback: z.number().int().positive().optional(),
    cli_command_registrar: z.number().int().positive().optional(),
    unknown: z.number().int().positive().optional(),
  })
  .strict();

const largeFileShapesSchema = z
  .object({
    domain: z.number().int().positive().optional(),
    test_file: z.number().int().positive().optional(),
  })
  .strict();

const thresholdsSchema = z
  .object({
    largeFileLines: z.number().int().positive().optional(),
    largeFunctionLines: z.number().int().positive().optional(),
    todoDensityPerKLoc: z.number().int().nonnegative().optional(),
    largeFunction: largeFunctionShapesSchema.optional(),
    largeFile: largeFileShapesSchema.optional(),
  })
  .strict();

const detectorsSchema = z
  .object({
    enable: z.array(z.string().min(1)).optional(),
    disable: z.array(z.string().min(1)).optional(),
  })
  .strict();

const iaSchema = z
  .object({
    aliasGroups: z.array(aliasGroupSchema).optional(),
  })
  .strict();

const suppressionsConfigSchema = z
  .object({
    path: z.string().min(1).optional(),
  })
  .strict();

const architectureSchema = z
  .object({
    layers: z
      .array(
        z
          .object({
            name: z.string().min(1),
            pattern: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    rules: z
      .array(
        z
          .object({
            from: z.string().min(1),
            cannotImport: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/**
 * Top-level schema. Unknown keys are stripped (and ignored) so future
 * config releases can extend the file without breaking old CLI builds.
 * Known keys with malformed _values_ raise a {@link ConfigParseError}.
 */
export const CrimesConfigSchema = z
  .object({
    $schema: z.string().optional(),
    include: z.array(z.string().min(1)).optional(),
    exclude: z.array(z.string().min(1)).optional(),
    thresholds: thresholdsSchema.optional(),
    detectors: detectorsSchema.optional(),
    ia: iaSchema.optional(),
    suppressions: suppressionsConfigSchema.optional(),
    architecture: architectureSchema.optional(),
  })
  .passthrough();

/**
 * Load `crimes.config.json` from the given root and merge it with
 * {@link DEFAULT_CONFIG}.
 *
 * Throws {@link ConfigParseError} when the file exists but is unreadable,
 * not JSON, or contains a known key with a malformed value. The CLI maps
 * this to exit code 2.
 */
export function loadConfig(root: string): CrimesConfig {
  return loadConfigDetailed(root).config;
}

/**
 * Same as {@link loadConfig} but returns the soft-issues list alongside
 * the merged config. Reserved for programmatic consumers that want to
 * surface advisory warnings; the CLI prefers the throw-on-error path.
 */
export function loadConfigDetailed(root: string): LoadConfigResult {
  const path = resolve(root, "crimes.config.json");
  if (!existsSync(path)) {
    return { config: DEFAULT_CONFIG, issues: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigParseError(path, `unable to read file — ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigParseError(path, `invalid JSON — ${message}`);
  }

  const result = CrimesConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigParseError(path, formatZodIssues(result.error.issues));
  }

  const merged = mergeConfig(DEFAULT_CONFIG, result.data as CrimesConfig);
  return { config: merged, issues: [], path };
}

function formatZodIssues(issues: z.core.$ZodIssue[]): string {
  // Surface the first malformed value precisely — the user fixes it and
  // re-runs. Subsequent issues, if any, surface on the next run.
  const first = issues[0];
  if (!first) return "validation failed";
  const path = first.path.length > 0 ? first.path.join(".") : "(root)";
  return `${path}: ${first.message}`;
}

function mergeConfig(base: CrimesConfig, override: CrimesConfig): CrimesConfig {
  const merged: CrimesConfig = {
    include: override.include ?? base.include,
    exclude: override.exclude ?? base.exclude,
    thresholds: {
      ...base.thresholds,
      ...stripUndefined(override.thresholds ?? {}),
    },
  };
  if (override.$schema !== undefined) merged.$schema = override.$schema;
  if (override.thresholds?.largeFunction !== undefined) {
    merged.thresholds.largeFunction = { ...override.thresholds.largeFunction };
  }
  if (override.thresholds?.largeFile !== undefined) {
    merged.thresholds.largeFile = { ...override.thresholds.largeFile };
  }
  if (override.detectors !== undefined) merged.detectors = override.detectors;
  if (override.ia !== undefined) merged.ia = override.ia;
  if (override.suppressions !== undefined) {
    merged.suppressions = override.suppressions;
  }
  if (override.architecture !== undefined) {
    merged.architecture = override.architecture;
  }
  return merged;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * Resolve the suppressions file path for a given root, honouring
 * `config.suppressions.path` when set. Relative paths resolve against the
 * repo root; absolute paths win unchanged.
 */
export function resolveSuppressionsPath(
  root: string,
  config: CrimesConfig,
): string {
  const override = config.suppressions?.path;
  if (!override) return resolve(root, DEFAULT_SUPPRESSIONS_PATH);
  return resolve(root, override);
}
