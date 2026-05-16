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

/**
 * A single entry in a nav-like array literal.
 *
 * Optional fields are populated when the corresponding object key is found
 * with a string-literal value. Non-string values (translation calls, computed
 * expressions, etc.) are intentionally ignored — IA findings should only
 * rely on values that can be quoted verbatim in `evidence`.
 */
export interface NavLiteralEntry {
  /** Path-like value from `href|path|to|url|route` keys. */
  destination?: string;
  /** Label-like value from `label|title|name|text` keys. */
  label?: string;
  /** Other string-typed properties on the entry (icon, role, permission). */
  attributes: Record<string, string>;
}

export interface NavLiteral {
  /** Identifier the array is assigned to, if recoverable. */
  identifier?: string;
  /** 1-based line of the array literal's opening bracket. */
  line: number;
  entries: NavLiteralEntry[];
}

export type UiStringContext =
  | "jsx_title"
  | "document_title"
  | "metadata_title"
  | "use_title"
  | "jsx_label";

/**
 * A string literal extracted in a UI-text-ish context — page titles,
 * breadcrumb labels, nav labels. Used by IA detectors to compare what
 * different files claim a destination is called.
 */
export interface UiStringLiteral {
  value: string;
  /** 1-based line where the literal appears. */
  line: number;
  context: UiStringContext;
  /** JSX tag or call-site name (`"title"`, `"useTitle"`, `"Breadcrumb"`). */
  source?: string;
}

export interface ParsedFile {
  /** Total non-empty line count (1-based). */
  lineCount: number;
  /** Every declared function/method/arrow, with body line ranges. */
  functions: ParsedFunction[];
  /** Every call to `Date.now()` or `new Date(...)` in the file. */
  dateNowOrNewDateUses: DateUse[];
  /** Name of the file's default export, when recoverable. */
  defaultExport?: string;
  /** Array literals that look like navigation entries. */
  navLiterals?: NavLiteral[];
  /** String literals tagged with the UI context they appear in. */
  uiStringLiterals?: UiStringLiteral[];
}

export interface ParseInput {
  absolutePath: string;
  source: string;
}

const DESTINATION_KEYS = new Set([
  "href",
  "path",
  "to",
  "url",
  "route",
]);

const LABEL_KEYS = new Set([
  "label",
  "title",
  "name",
  "text",
]);

const UI_LABEL_TAGS = /^(Breadcrumb|Breadcrumbs|Nav|NavItem|NavLink|Sidebar|SidebarItem|Menu|MenuItem|Tab|TabItem)/;

const TITLE_HOOK_CALLEES = new Set([
  "useTitle",
  "setTitle",
  "setPageTitle",
  "setDocumentTitle",
]);

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
  const navLiterals: NavLiteral[] = [];
  const uiStringLiterals: UiStringLiteral[] = [];
  let defaultExport: string | undefined;

  const visit = (node: ts.Node): void => {
    collectFunction(node, sourceFile, functions);
    collectDateUse(node, sourceFile, dateUses);
    collectUiStringLiteral(node, sourceFile, uiStringLiterals);
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, (node) => {
    defaultExport = defaultExport ?? extractDefaultExport(node);
    collectTopLevelNavLiterals(node, sourceFile, navLiterals);
    visit(node);
  });

  return {
    lineCount: countNonEmptyLines(input.source),
    functions,
    dateNowOrNewDateUses: dateUses,
    defaultExport,
    navLiterals,
    uiStringLiterals,
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

function extractDefaultExport(node: ts.Node): string | undefined {
  // `export default function Foo() {}` / `export default class Foo {}`
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    hasDefaultModifier(node) &&
    node.name
  ) {
    return node.name.text;
  }

  // `export default Foo` / `export default someExpression`
  if (ts.isExportAssignment(node) && !node.isExportEquals) {
    const expr = node.expression;
    if (ts.isIdentifier(expr)) return expr.text;
    // `export default class Foo {}` parses as an ExportAssignment in some shapes.
    if (ts.isClassExpression(expr) && expr.name) return expr.name.text;
    if (ts.isFunctionExpression(expr) && expr.name) return expr.name.text;
    return undefined;
  }

  // `export { Foo as default }`
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const spec of node.exportClause.elements) {
      if (spec.name.text === "default" && spec.propertyName) {
        return spec.propertyName.text;
      }
    }
  }

  return undefined;
}

function hasDefaultModifier(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) return false;
  return modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function collectTopLevelNavLiterals(
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

function propKey(prop: ts.PropertyAssignment): string | undefined {
  const n = prop.name;
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return undefined;
}

function propStringValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function collectUiStringLiteral(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: UiStringLiteral[],
): void {
  // 1. `<title>X</title>` and named title-like elements
  if (ts.isJsxElement(node)) {
    const opening = node.openingElement;
    const tagName = jsxTagName(opening.tagName);
    if (tagName === "title" || tagName === "Title") {
      const inner = jsxTextContent(node);
      if (inner) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          opening.getStart(sourceFile),
        );
        out.push({
          value: inner,
          line: line + 1,
          context: "jsx_title",
          source: tagName,
        });
      }
    }

    // 2. `<Breadcrumb label="X" />` etc. — attribute on a UI-label-tag.
    if (tagName && UI_LABEL_TAGS.test(tagName)) {
      pushJsxLabelAttributes(opening.attributes, sourceFile, out, tagName);
    }
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = jsxTagName(node.tagName);
    if (tagName && UI_LABEL_TAGS.test(tagName)) {
      pushJsxLabelAttributes(node.attributes, sourceFile, out, tagName);
    }
  }

  // 3. `document.title = "X"`
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    ts.isIdentifier(node.left.expression) &&
    node.left.expression.text === "document" &&
    node.left.name.text === "title"
  ) {
    const value = propStringValue(node.right);
    if (value !== undefined) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      out.push({
        value,
        line: line + 1,
        context: "document_title",
        source: "document.title",
      });
    }
  }

  // 4. `useTitle("X")` / `setTitle("X")` / similar title hooks.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const callee = node.expression.text;
    if (TITLE_HOOK_CALLEES.has(callee) && node.arguments.length >= 1) {
      const first = node.arguments[0];
      const value = first ? propStringValue(first) : undefined;
      if (value !== undefined) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        out.push({
          value,
          line: line + 1,
          context: "use_title",
          source: callee,
        });
      }
    }
  }

  // 5. `export const metadata = { title: "X" }` (Next.js App Router).
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "metadata" &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const prop of node.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = propKey(prop);
      if (key !== "title") continue;
      const value = propStringValue(prop.initializer);
      if (value === undefined) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
      out.push({
        value,
        line: line + 1,
        context: "metadata_title",
        source: "metadata.title",
      });
    }
  }
}

function jsxTagName(tag: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tag)) return tag.text;
  // PropertyAccessExpression (e.g. `Foo.Bar`) — keep the tail.
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return undefined;
}

function jsxTextContent(node: ts.JsxElement): string | undefined {
  const chunks: string[] = [];
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      chunks.push(child.text);
    } else if (ts.isJsxExpression(child) && child.expression && propStringValue(child.expression) !== undefined) {
      chunks.push(propStringValue(child.expression)!);
    } else {
      // Mixed content (other JSX, computed expressions). Don't risk a false reading.
      return undefined;
    }
  }
  const joined = chunks.join("").trim();
  return joined.length > 0 ? joined : undefined;
}

function pushJsxLabelAttributes(
  attrs: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
  out: UiStringLiteral[],
  tagName: string,
): void {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (!ts.isIdentifier(attr.name)) continue;
    const key = attr.name.text;
    if (!LABEL_KEYS.has(key)) continue;
    const init = attr.initializer;
    if (!init) continue;
    let value: string | undefined;
    if (ts.isStringLiteral(init)) {
      value = init.text;
    } else if (ts.isJsxExpression(init) && init.expression) {
      value = propStringValue(init.expression);
    }
    if (value === undefined) continue;
    const { line } = sourceFile.getLineAndCharacterOfPosition(attr.getStart(sourceFile));
    out.push({
      value,
      line: line + 1,
      context: "jsx_label",
      source: tagName,
    });
  }
}
