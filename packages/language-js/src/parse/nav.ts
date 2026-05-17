import ts from "typescript";
import { DESTINATION_KEYS, LABEL_KEYS } from "./constants.js";
import { propKey, propStringValue } from "./utils.js";
import type { NavLiteral, NavLiteralEntry } from "./types.js";

export function collectTopLevelNavLiterals(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: NavLiteral[],
): void {
  // Walk a small set of top-level shapes that hold nav arrays:
  //   const X = [...]
  //   export const X = [...]
  //   const X = [...] as const
  //   export default [...]
  //   export const X = { ..., items: [...] }  → not handled; nav lives in top-level arrays
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
      const arr = unwrapArrayLiteral(decl.initializer);
      if (!arr) continue;
      pushNavLiteral(arr, sourceFile, out, decl.name.text);
    }
    return;
  }

  if (ts.isExportAssignment(node) && !node.isExportEquals) {
    const arr = unwrapArrayLiteral(node.expression);
    if (arr) pushNavLiteral(arr, sourceFile, out, "default");
  }
}

function unwrapArrayLiteral(node: ts.Node): ts.ArrayLiteralExpression | undefined {
  // Peel `as const`, `satisfies T`, parens.
  let current: ts.Node = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isArrayLiteralExpression(current) ? current : undefined;
}

function pushNavLiteral(
  array: ts.ArrayLiteralExpression,
  sourceFile: ts.SourceFile,
  out: NavLiteral[],
  identifier: string,
): void {
  const entries: NavLiteralEntry[] = [];
  for (const element of array.elements) {
    const entry = extractNavEntry(element);
    if (entry) entries.push(entry);
  }

  if (entries.length < 2) return;

  // Require ≥1 entry to actually be a nav-like object: has BOTH a destination
  // AND a label string. Otherwise this is just an array of objects.
  const navLike = entries.filter((e) => e.destination && e.label).length;
  if (navLike === 0) return;

  const { line } = sourceFile.getLineAndCharacterOfPosition(array.getStart(sourceFile));
  out.push({ identifier, line: line + 1, entries });
}

function extractNavEntry(node: ts.Expression): NavLiteralEntry | undefined {
  // Peel parens, casts.
  let inner: ts.Node = node;
  while (
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isParenthesizedExpression(inner)
  ) {
    inner = inner.expression;
  }
  if (!ts.isObjectLiteralExpression(inner)) return undefined;

  let destination: string | undefined;
  let label: string | undefined;
  const attributes: Record<string, string> = {};

  for (const prop of inner.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propKey(prop);
    if (!key) continue;
    const value = propStringValue(prop.initializer);
    if (value === undefined) continue;

    if (DESTINATION_KEYS.has(key)) {
      destination = destination ?? value;
      continue;
    }
    if (LABEL_KEYS.has(key)) {
      label = label ?? value;
      continue;
    }
    attributes[key] = value;
  }

  if (!destination && !label && Object.keys(attributes).length === 0) {
    return undefined;
  }
  return { destination, label, attributes };
}
