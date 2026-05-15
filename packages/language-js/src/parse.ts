import { extname } from "node:path";
import ts from "typescript";

export type FunctionKind =
  | "function"
  | "arrow"
  | "method"
  | "function_expression"
  | "constructor";

export interface ParsedFunction {
  name: string | undefined;
  kind: FunctionKind;
  startLine: number;
  endLine: number;
}

export interface DateUse {
  /** `Date.now()` or `new Date(...)` */
  kind: "now" | "new";
  line: number;
}

export interface ParsedFile {
  /** Total non-empty line count (1-based). */
  lineCount: number;
  /** Every declared function/method/arrow, with body line ranges. */
  functions: ParsedFunction[];
  /** Every call to `Date.now()` or `new Date(...)` in the file. */
  dateNowOrNewDateUses: DateUse[];
}

export interface ParseInput {
  absolutePath: string;
  source: string;
}

export function parseFile(input: ParseInput): ParsedFile {
  const ext = extname(input.absolutePath).toLowerCase();
  const scriptKind = pickScriptKind(ext);
  const sourceFile = ts.createSourceFile(
    input.absolutePath,
    input.source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );

  const functions: ParsedFunction[] = [];
  const dateUses: DateUse[] = [];

  const visit = (node: ts.Node): void => {
    collectFunction(node, sourceFile, functions);
    collectDateUse(node, sourceFile, dateUses);
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  return {
    lineCount: countNonEmptyLines(input.source),
    functions,
    dateNowOrNewDateUses: dateUses,
  };
}

function pickScriptKind(ext: string): ts.ScriptKind {
  switch (ext) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".mjs":
    case ".cjs":
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function collectFunction(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: ParsedFunction[],
): void {
  if (ts.isFunctionDeclaration(node)) {
    pushFunction(node, sourceFile, out, "function", node.name?.text);
  } else if (ts.isMethodDeclaration(node)) {
    pushFunction(node, sourceFile, out, "method", methodName(node));
  } else if (ts.isConstructorDeclaration(node)) {
    pushFunction(node, sourceFile, out, "constructor", "constructor");
  } else if (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    const kind: FunctionKind = ts.isArrowFunction(node) ? "arrow" : "function_expression";
    pushFunction(node, sourceFile, out, kind, inferAssignedName(node));
  } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    pushFunction(node, sourceFile, out, "method", methodName(node));
  }
}

function pushFunction(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: ParsedFunction[],
  kind: FunctionKind,
  name: string | undefined,
): void {
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  out.push({
    name,
    kind,
    startLine: startLine + 1,
    endLine: endLine + 1,
  });
}

function methodName(
  node: ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
): string | undefined {
  const n = node.name;
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return undefined;
}

function inferAssignedName(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (
    ts.isPropertyDeclaration(parent) &&
    (ts.isIdentifier(parent.name) || ts.isPrivateIdentifier(parent.name))
  ) {
    return parent.name.text;
  }
  return undefined;
}

function collectDateUse(
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

function countNonEmptyLines(source: string): number {
  const lines = source.split(/\r?\n/);
  // Trim trailing empty newline if present, so a 10-line file with a final
  // newline still reports 10 lines.
  let total = lines.length;
  if (total > 0 && lines[total - 1] === "") total -= 1;
  return total;
}
