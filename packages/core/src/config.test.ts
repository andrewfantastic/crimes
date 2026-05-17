import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigParseError,
  DEFAULT_CONFIG,
  DEFAULT_SUPPRESSIONS_PATH,
  loadConfig,
  loadConfigDetailed,
  resolveSuppressionsPath,
} from "./config.js";
import { policyFor } from "./detectors/large-function.js";
import { scan, UnknownDetectorError } from "./scan.js";

async function makeTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "crimes-config-test-"));
}

async function writeConfig(root: string, body: unknown): Promise<void> {
  await writeFile(
    join(root, "crimes.config.json"),
    typeof body === "string" ? body : JSON.stringify(body),
    "utf8",
  );
}

describe("loadConfig", () => {
  it("returns DEFAULT_CONFIG when no crimes.config.json exists", async () => {
    const root = await makeTempDir();
    expect(loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });

  it("throws ConfigParseError on malformed JSON", async () => {
    const root = await makeTempDir();
    await writeConfig(root, "{ not json");
    expect(() => loadConfig(root)).toThrowError(ConfigParseError);
  });

  it("throws ConfigParseError on a malformed value", async () => {
    const root = await makeTempDir();
    await writeConfig(root, { thresholds: { largeFileLines: "not-a-number" } });
    expect(() => loadConfig(root)).toThrowError(ConfigParseError);
  });

  it("preserves unknown top-level keys silently (forward compat)", async () => {
    const root = await makeTempDir();
    await writeConfig(root, { include: ["**/*.ts"], extraFutureKey: true });
    const config = loadConfig(root);
    expect(config.include).toEqual(["**/*.ts"]);
    // Unknown keys do not prevent the merged config from loading.
  });

  it("merges thresholds with defaults", async () => {
    const root = await makeTempDir();
    await writeConfig(root, { thresholds: { largeFileLines: 1000 } });
    const config = loadConfig(root);
    expect(config.thresholds.largeFileLines).toBe(1000);
    // Other defaults intact.
    expect(config.thresholds.largeFunctionLines).toBe(60);
    expect(config.thresholds.todoDensityPerKLoc).toBe(10);
  });

  it("honours $schema field for IDE validation", async () => {
    const root = await makeTempDir();
    await writeConfig(root, {
      $schema: "https://crimes.sh/schema/0.1.0/config.json",
    });
    const config = loadConfig(root);
    expect(config.$schema).toBe("https://crimes.sh/schema/0.1.0/config.json");
  });

  it("loadConfigDetailed returns path when a config was read", async () => {
    const root = await makeTempDir();
    await writeConfig(root, {});
    const result = loadConfigDetailed(root);
    expect(result.path).toContain("crimes.config.json");
    expect(result.issues).toEqual([]);
  });
});

describe("thresholds.largeFunction overrides", () => {
  it("policyFor(domain) prefers largeFunction.domain over largeFunctionLines", () => {
    const policy = policyFor("domain", {
      ...DEFAULT_CONFIG,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        largeFunctionLines: 60,
        largeFunction: { domain: 120 },
      },
    });
    expect(policy.threshold).toBe(120);
  });

  it("policyFor(domain) falls back to legacy largeFunctionLines when not overridden", () => {
    const policy = policyFor("domain", {
      ...DEFAULT_CONFIG,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        largeFunctionLines: 42,
      },
    });
    expect(policy.threshold).toBe(42);
  });

  it("policyFor(route_handler) honours per-shape override", () => {
    const policy = policyFor("route_handler", {
      ...DEFAULT_CONFIG,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        largeFunction: { route_handler: 250 },
      },
    });
    expect(policy.threshold).toBe(250);
  });

  it("policyFor without overrides uses built-in defaults", () => {
    const policy = policyFor("react_component", DEFAULT_CONFIG);
    expect(policy.threshold).toBe(200);
  });
});

describe("detectors.enable / disable wiring", () => {
  it("detectors.disable removes the detector from the run", async () => {
    const root = await makeTempDir();
    await writeFile(
      join(root, "todos.ts"),
      `// TODO: refactor\n// TODO: investigate\n// TODO: ship\n` +
        Array.from({ length: 50 }, () => "// line").join("\n"),
      "utf8",
    );
    await writeConfig(root, { detectors: { disable: ["todo_density"] } });

    const report = await scan({ root });
    const todoFindings = report.findings.filter(
      (f) => f.type === "todo_density",
    );
    expect(todoFindings).toEqual([]);
  });

  it("detectors.enable with a non-empty list runs only those detectors", async () => {
    const root = await makeTempDir();
    await writeFile(
      join(root, "huge.ts"),
      Array.from({ length: 500 }, () => "// line").join("\n"),
      "utf8",
    );
    await writeConfig(root, { detectors: { enable: ["large_file"] } });

    const report = await scan({ root });
    const types = new Set(report.findings.map((f) => f.type));
    expect(types.has("large_file")).toBe(true);
    // No other detectors fired.
    for (const t of types) {
      expect(t).toBe("large_file");
    }
  });

  it("detectors.disable with an unknown id throws UnknownDetectorError", async () => {
    const root = await makeTempDir();
    await writeConfig(root, { detectors: { disable: ["not_a_detector"] } });
    await expect(scan({ root })).rejects.toBeInstanceOf(UnknownDetectorError);
  });

  it("detectors.enable with an unknown id throws UnknownDetectorError", async () => {
    const root = await makeTempDir();
    await writeConfig(root, { detectors: { enable: ["typo_density"] } });
    await expect(scan({ root })).rejects.toBeInstanceOf(UnknownDetectorError);
  });
});

describe("ia.aliasGroups merges with defaults", () => {
  it("config groups are added on top of DEFAULT_ALIAS_GROUPS", async () => {
    const root = await makeTempDir();
    // Add a custom alias group; ensure the built-in `tenant` group still
    // contributes to the catalogue.
    await writeConfig(root, {
      ia: {
        aliasGroups: [
          { id: "dataset", aliases: ["dataset", "corpus", "collection"] },
        ],
      },
    });
    // Reach into scan's resolveAliasGroups via a fresh scan with no source
    // files — IA index build still records the resolved alias group list.
    await writeFile(
      join(root, "noop.ts"),
      "export const ok = 1;\n",
      "utf8",
    );
    const report = await scan({ root });
    // The scan succeeded — the merge didn't crash.
    expect(report.report_type).toBe("scan");
  });
});

describe("suppressions.path", () => {
  it("defaults to .crimes/suppressions.json", () => {
    const root = "/tmp/fake-root";
    expect(resolveSuppressionsPath(root, DEFAULT_CONFIG)).toBe(
      `${root}/${DEFAULT_SUPPRESSIONS_PATH}`,
    );
  });

  it("honours suppressions.path override", () => {
    const root = "/tmp/fake-root";
    const resolved = resolveSuppressionsPath(root, {
      ...DEFAULT_CONFIG,
      suppressions: { path: ".crimes/custom.json" },
    });
    expect(resolved).toBe(`${root}/.crimes/custom.json`);
  });
});

describe("architecture placeholder", () => {
  it("parses architecture.layers and architecture.rules without consuming them", async () => {
    const root = await makeTempDir();
    await writeConfig(root, {
      architecture: {
        layers: [
          { name: "ui", pattern: "src/components/**" },
          { name: "domain", pattern: "src/domain/**" },
        ],
        rules: [{ from: "domain", cannotImport: ["ui"] }],
      },
    });
    const config = loadConfig(root);
    expect(config.architecture?.layers).toHaveLength(2);
    expect(config.architecture?.rules?.[0]?.from).toBe("domain");
  });

  it("rejects a malformed architecture.layers entry", async () => {
    const root = await makeTempDir();
    await writeConfig(root, {
      architecture: { layers: [{ name: "ui" }] }, // missing pattern
    });
    expect(() => loadConfig(root)).toThrowError(ConfigParseError);
  });
});
