import type { Detector } from "../detector.js";
import type { Finding } from "../finding.js";
import { walkJsx } from "../jsx/walk.js";

/**
 * Fires on UI files where churn + responsive complexity + low test
 * proximity combine into a "this deserves visual review on PR" hint.
 *
 * The detector does not run any screenshot tooling itself — it
 * surfaces a recommendation that the team's existing Playwright /
 * Storybook / Chromatic pipeline be applied to this file in the next
 * change. Low-severity advisory; the wedge is "agent should slow
 * down", not "this file is wrong."
 */
export const visualRegressionReviewHintDetector: Detector = {
  id: "visual_regression_review_hint",
  name: "Visual Regression Review Hint",
  description:
    "Flags churn-heavy UI files with responsive complexity and weak " +
    "test coverage — change here probably warrants visual review.",
  whyItMatters:
    "Visual regressions slip through code review because the diff is " +
    "abstract. When a UI file already churns frequently and has weak " +
    "test coverage, the next edit benefits from a screenshot or " +
    "Storybook review even if the code change looks small.",

  run(ctx) {
    if (!ctx.scoring) return [];
    if (!isUiFile(ctx.file)) return [];

    const churn = ctx.scoring.churn.forFile(ctx.file);
    const testGap = ctx.scoring.testGap.forFile(ctx.file);
    if (churn < 0.7 || testGap < 0.7) return [];

    const responsiveComplexity = countResponsiveComplexity(ctx);
    if (responsiveComplexity === 0) return [];

    const evidence: string[] = [
      `churn: ${churn.toFixed(2)} (recently touched in many commits)`,
      `test gap: ${testGap.toFixed(2)} (no nearby test file)`,
      `responsive signals: ${responsiveComplexity} (style breakpoints or media queries)`,
    ];

    const finding: Finding = {
      id: "",
      type: "visual_regression_review_hint",
      charge: "Visual Regression Review Hint",
      severity: "low",
      confidence: 0.7,
      file: ctx.file,
      summary:
        `${ctx.file} appears to be a churn-heavy UI file with responsive ` +
        "complexity and weak test proximity. Visual review on the next " +
        "change is worth more than usual.",
      evidence,
      scores: {
        severity: 0.35,
        confidence: 0.7,
      },
      suggested_actions: [
        {
          kind: "request_visual_review",
          description:
            "Run the project's screenshot / Storybook / Chromatic " +
            "pipeline against the next PR that touches this file.",
          risk: "low",
        },
      ],
    };
    return [finding];
  },
};

function isUiFile(file: string): boolean {
  return /\.(tsx|jsx)$/.test(file);
}

function countResponsiveComplexity(
  ctx: import("../detector.js").DetectorContext,
): number {
  let count = 0;
  if (ctx.source.includes("@media")) count += 1;
  const roots = walkJsx({ source: ctx.source, ast: ctx.parsed });
  for (const root of roots) {
    const style = root.attributes.get("style");
    if (style && style.kind === "expression") {
      if (/\bwidth\s*:/.test(style.source)) count += 1;
      if (/\bfontSize\s*:/.test(style.source)) count += 1;
    }
  }
  return count;
}
