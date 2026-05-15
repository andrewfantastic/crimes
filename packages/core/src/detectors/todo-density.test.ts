import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import type { DetectorContext } from "../detector.js";
import { todoDensityDetector } from "./todo-density.js";

function makeCtx(source: string): DetectorContext {
  const lineCount = source.split(/\r?\n/).length;
  return {
    file: "src/todo.ts",
    absolutePath: "/tmp/todo.ts",
    source,
    parsed: { lineCount, functions: [], dateNowOrNewDateUses: [] },
    config: DEFAULT_CONFIG,
  };
}

describe("todoDensityDetector", () => {
  it("returns nothing when there are no markers", async () => {
    const findings = await todoDensityDetector.run(makeCtx("export const x = 1;\n"));
    expect(findings).toEqual([]);
  });

  it("counts TODO, FIXME, XXX, HACK separately", async () => {
    const src = ["// TODO: a", "// FIXME: b", "// XXX: c", "// HACK: d"].join("\n");
    const findings = await todoDensityDetector.run(makeCtx(src));
    expect(findings).toHaveLength(1);
    const evidence = findings[0]!.evidence.join(" ");
    expect(evidence).toContain("TODO");
    expect(evidence).toContain("FIXME");
    expect(evidence).toContain("XXX");
    expect(evidence).toContain("HACK");
  });

  it("escalates severity with marker count", async () => {
    const many = Array.from({ length: 15 }, (_, i) => `// TODO: thing ${i}`).join("\n");
    const findings = await todoDensityDetector.run(makeCtx(many));
    expect(findings[0]!.severity).toBe("high");
  });
});
