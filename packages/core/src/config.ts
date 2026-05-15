import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CrimesConfig {
  include: string[];
  exclude: string[];
  thresholds: {
    largeFileLines: number;
    largeFunctionLines: number;
    todoDensityPerKLoc: number;
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
 * Load `crimes.config.json` from the given root if it exists, otherwise
 * return defaults. Unknown keys are ignored.
 */
export function loadConfig(root: string): CrimesConfig {
  const path = resolve(root, "crimes.config.json");
  if (!existsSync(path)) return DEFAULT_CONFIG;

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CrimesConfig>;
    return mergeConfig(DEFAULT_CONFIG, raw);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(base: CrimesConfig, override: Partial<CrimesConfig>): CrimesConfig {
  return {
    include: override.include ?? base.include,
    exclude: override.exclude ?? base.exclude,
    thresholds: { ...base.thresholds, ...(override.thresholds ?? {}) },
  };
}
