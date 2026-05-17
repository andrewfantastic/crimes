import ts from "typescript";
import type { DateUse } from "./types.js";

export function collectDateUse(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: DateUse[],
): void {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "Date" &&
      expr.name.text === "now"
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      out.push({ kind: "now", line: line + 1 });
    }
  }

  if (ts.isNewExpression(node)) {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.text === "Date") {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      out.push({ kind: "new", line: line + 1 });
    }
  }
}
