import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFile } from "@crimes/language-js";
import { DEFAULT_CONFIG } from "../config.js";
import type { DetectorContext } from "../detector.js";
import type { ScoringContext } from "../scoring/build.js";
import { visualRegressionReviewHintDetector } from "./visual-regression-review-hint.js";

function fakeScoring(args: {
  churn: number;
  testGap: number;
}): ScoringContext {
  return {
    churn: { forFile: () => args.churn, limited: false },
    testGap: { forFile: () => args.testGap },
    blastRadius: { forFile: () => 0 },
  };
}

async function ctxFromSource(args: {
  file: string;
  source: string;
  scoring?: ScoringContext;
}): Promise<DetectorContext> {
  const dir = await mkdtemp(join(tmpdir(), "crimes-vrrh-"));
  const abs = join(dir, args.file);
  await writeFile(abs, args.source, "utf8");
  const parsed = parseFile({ absolutePath: abs, source: args.source });
  const ctx: DetectorContext = {
    file: args.file,
    absolutePath: abs,
    source: args.source,
    parsed,
    config: DEFAULT_CONFIG,
  };
  if (args.scoring) ctx.scoring = args.scoring;
  return ctx;
}

describe("visualRegressionReviewHintDetector", () => {
  it("fires on a churn-heavy, untested UI file with responsive style", async () => {
    const ctx = await ctxFromSource({
      file: "Component.tsx",
      source:
        `export default function App() {\n` +
        `  return <div style={{ width: 800, fontSize: 24 }} />;\n` +
        `}\n`,
      scoring: fakeScoring({ churn: 0.8, testGap: 0.9 }),
    });
    const findings = await visualRegressionReviewHintDetector.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("visual_regression_review_hint");
    expect(findings[0]!.severity).toBe("low");
  });

  it("does not fire when churn is low", async () => {
    const ctx = await ctxFromSource({
      file: "Component.tsx",
      source: `export default function App() { return <div style={{ width: 800 }} />; }`,
      scoring: fakeScoring({ churn: 0.2, testGap: 0.9 }),
    });
    const findings = await visualRegressionReviewHintDetector.run(ctx);
    expect(findings).toEqual([]);
  });

  it("does not fire when there's a sibling test (low testGap)", async () => {
    const ctx = await ctxFromSource({
      file: "Component.tsx",
      source: `export default function App() { return <div style={{ width: 800 }} />; }`,
      scoring: fakeScoring({ churn: 0.9, testGap: 0.1 }),
    });
    const findings = await visualRegressionReviewHintDetector.run(ctx);
    expect(findings).toEqual([]);
  });

  it("does not fire on non-UI files", async () => {
    const ctx = await ctxFromSource({
      file: "Component.ts",
      source: `export const x = 1;`,
      scoring: fakeScoring({ churn: 0.9, testGap: 0.9 }),
    });
    const findings = await visualRegressionReviewHintDetector.run(ctx);
    expect(findings).toEqual([]);
  });

  it("emits nothing when ctx.scoring is absent", async () => {
    const ctx = await ctxFromSource({
      file: "Component.tsx",
      source: `export default function App() { return <div style={{ width: 800 }} />; }`,
    });
    const findings = await visualRegressionReviewHintDetector.run(ctx);
    expect(findings).toEqual([]);
  });
});
