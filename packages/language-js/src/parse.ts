import { extname } from "node:path";
import ts from "typescript";

export type FunctionKind =
  | "function"
  | "arrow"
  | "method"
  | "function_expression"
  | "constructor";

/**
 * Coarse semantic shape of a function, used by `largeFunctionDetector` to
 * pick a size threshold appropriate to the shape:
 *
 * - **`domain`** — a plain named function/method/arrow. Uses the
 *   configured `thresholds.largeFunctionLines` (default 60). The
 *   historical and most aggressive bucket.
 * - **`test_callback`** — a function passed as an argument to a known
 *   test-framework call (`describe`, `it`, `beforeAll`, …). High
 *   threshold + low severity at threshold — 60-line test blocks are
 *   not a smell.
 * - **`react_component`** — a PascalCase function whose body contains
 *   JSX. High threshold; UI rendering doesn't compress like domain
 *   logic.
 * - **`page_export`** — the default export of a route file
 *   (Next.js Pages or App Router page / layout / template / default).
 *   High threshold; conventional surface area.
 * - **`route_handler`** — a named export with an HTTP-verb name
 *   (`GET`, `POST`, …) under an App Router route directory, or the
 *   default export under `pages/api/**` (Pages Router API). Medium
 *   threshold (100).
 * - **`cli_command_registrar`** — a Commander.js builder DSL function:
 *   either the outer `registerXCommand(program)` wrapper whose body is
 *   a `program.command(…).description(…).option(…).action(…)` chain,
 *   or the anonymous arrow / function passed to `.action(…)` on that
 *   chain. High threshold, low severity at threshold — the chain is
 *   declarative registration, not branching logic.
 * - **`unknown`** — an anonymous function/arrow that didn't match any
 *   of the above. Sits at a slightly relaxed threshold (80) so real
 *   god-functions hiding inside callbacks still surface.
 */
export type FunctionShape =
  | "domain"
  | "test_callback"
  | "react_component"
  | "page_export"
  | "route_handler"
  | "cli_command_registrar"
  | "unknown";

export interface ParsedFunction {
  name: string | undefined;
  kind: FunctionKind;
  startLine: number;
  endLine: number;
  /**
   * Coarse semantic classification — see {@link FunctionShape}.
   * Detectors consume this to pick a size threshold appropriate to
   * the shape; agents reading the JSON consume the resulting
   * `Finding.evidence` line that names the shape.
   */
  shape: FunctionShape;
  /**
   * Short, machine-friendly evidence strings explaining *why* the
   * shape was picked (e.g. `"argument of describe(...)"`,
   * `"default export under app/billing/page.tsx"`). Detectors quote
   * these verbatim into `Finding.evidence`.
   */
  shapeEvidence?: string[];
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

/**
 * Statically-knowable value of a JSX attribute. Frontend detectors read
 * these to look for design-token escapes (hex colors in `style`),
 * accessibility hazards (`onClick` with no `role`), and copy drift
 * (label attribute literals).
 */
export type JsxAttributeValue =
  | { kind: "string"; value: string }
  | { kind: "expression"; source: string }
  | { kind: "boolean"; value: true }
  | { kind: "spread"; source: string };

/** A child of a JSX element — another element, or a text run. */
export type JsxNode =
  | { kind: "element"; element: JsxElementInfo }
  | { kind: "text"; value: string };

/**
 * A single JSX element extracted from a source file. Attribute values are
 * captured when they are statically knowable (string literal, boolean
 * shorthand, `{…}` expression source). Children appear in document order;
 * non-element / non-text nodes (fragments are flattened into their
 * children) are dropped from `children`.
 */
export interface JsxElementInfo {
  /** Element name as written (`"Button"`, `"div"`, `"Pricing.Tier"`). */
  name: string;
  /** Inclusive [start, end] 1-based line range. */
  lines: [number, number];
  /** Attributes by name, with literal values when statically known. */
  attributes: Map<string, JsxAttributeValue>;
  /** Children, in document order. */
  children: JsxNode[];
  /** True for `<Component />` (self-closing, no children). */
  selfClosing: boolean;
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
  /**
   * Top-level JSX trees discovered in this file. Nested elements appear
   * as children of their parent rather than as separate roots. Absent
   * (rather than `[]`) for files without any JSX — keeps the JSON
   * fixture tidy on non-React surfaces.
   */
  jsxElements?: JsxElementInfo[];
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

/**
 * Test-framework callees whose argument functions should be classified as
 * `test_callback`. Includes Mocha/Jest/Vitest equivalents, focus / skip
 * variants, and hooks (`beforeAll`, etc.).
 */
const TEST_CALLEES: ReadonlySet<string> = new Set([
  "describe",
  "fdescribe",
  "xdescribe",
  "it",
  "fit",
  "xit",
  "test",
  "ftest",
  "xtest",
  "suite",
  "context",
  "beforeAll",
  "beforeEach",
  "afterAll",
  "afterEach",
  "before",
  "after",
]);

/**
 * HTTP verbs that an App Router route handler may export. Matched
 * case-sensitively because the framework expects exactly these casings.
 */
const HTTP_VERBS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

/**
 * Matches an App Router file under `app/` or `src/app/`. Used to gate
 * the `route_handler` and `page_export` shapes — the AST patterns alone
 * (named export with HTTP-verb name, default export with a component
 * body) aren't enough to distinguish framework files from coincidental
 * matches in normal source code.
 */
const APP_ROUTER_DIR_RE = /(?:^|[\\/])(?:src[\\/])?app[\\/]/;

/**
 * Matches an App Router conventional file: `page.tsx`, `layout.tsx`,
 * `template.tsx`, `default.tsx`, `error.tsx`, `loading.tsx`,
 * `not-found.tsx`, with `.ts` / `.jsx` / `.js` variants accepted.
 */
const APP_ROUTER_PAGE_FILE_RE =
  /(?:^|[\\/])(page|layout|template|default|error|loading|not-found)\.(?:tsx|ts|jsx|js|mjs|cjs)$/i;

/**
 * Matches a Pages Router file: any `.{tsx,jsx}` under `pages/` or
 * `src/pages/` that isn't under `pages/api/` (API routes use a default
 * export but render no JSX). Excludes `_app.tsx` / `_document.tsx` too —
 * they are page exports but commonly tiny, so classification doesn't
 * help; they fall through to `domain`.
 */
const PAGES_ROUTER_PAGE_RE =
  /(?:^|[\\/])(?:src[\\/])?pages[\\/](?!api[\\/])[^\s]*\.(?:tsx|jsx|ts|js)$/i;

const PAGES_ROUTER_API_RE =
  /(?:^|[\\/])(?:src[\\/])?pages[\\/]api[\\/].*\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

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
  const jsxElements: JsxElementInfo[] = [];
  let defaultExport: string | undefined;

  const visit = (node: ts.Node): void => {
    collectFunction(node, sourceFile, functions, input.absolutePath);
    collectDateUse(node, sourceFile, dateUses);
    collectUiStringLiteral(node, sourceFile, uiStringLiterals);
    collectJsxRoot(node, sourceFile, input.source, jsxElements);
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, (node) => {
    defaultExport = defaultExport ?? extractDefaultExport(node);
    collectTopLevelNavLiterals(node, sourceFile, navLiterals);
    visit(node);
  });

  const result: ParsedFile = {
    lineCount: countNonEmptyLines(input.source),
    functions,
    dateNowOrNewDateUses: dateUses,
    defaultExport,
    navLiterals,
    uiStringLiterals,
  };
  if (jsxElements.length > 0) result.jsxElements = jsxElements;
  return result;
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
  absolutePath: string,
): void {
  if (ts.isFunctionDeclaration(node)) {
    pushFunction(node, sourceFile, out, "function", node.name?.text, absolutePath);
  } else if (ts.isMethodDeclaration(node)) {
    pushFunction(node, sourceFile, out, "method", methodName(node), absolutePath);
  } else if (ts.isConstructorDeclaration(node)) {
    pushFunction(node, sourceFile, out, "constructor", "constructor", absolutePath);
  } else if (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    const kind: FunctionKind = ts.isArrowFunction(node) ? "arrow" : "function_expression";
    pushFunction(node, sourceFile, out, kind, inferAssignedName(node), absolutePath);
  } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    pushFunction(node, sourceFile, out, "method", methodName(node), absolutePath);
  }
}

function pushFunction(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: ParsedFunction[],
  kind: FunctionKind,
  name: string | undefined,
  absolutePath: string,
): void {
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  const { shape, shapeEvidence } = classifyShape({
    node,
    kind,
    name,
    absolutePath,
  });
  const entry: ParsedFunction = {
    name,
    kind,
    startLine: startLine + 1,
    endLine: endLine + 1,
    shape,
  };
  if (shapeEvidence && shapeEvidence.length > 0) {
    entry.shapeEvidence = shapeEvidence;
  }
  out.push(entry);
}

/**
 * Decide the {@link FunctionShape} for a parsed function. Rules are
 * evaluated in priority order — first match wins. The classification is
 * conservative: anything ambiguous falls through to `"domain"` (named) or
 * `"unknown"` (anonymous), so we never miss a real god-function that
 * happens to share AST shape with a test callback.
 */
function classifyShape(args: {
  node: ts.Node;
  kind: FunctionKind;
  name: string | undefined;
  absolutePath: string;
}): { shape: FunctionShape; shapeEvidence: string[] } {
  const { node, kind, name, absolutePath } = args;

  // 1. test_callback: the function is an argument to a known test-framework
  //    call. Arrow / function_expression only — a named declaration isn't a
  //    callback. Hooks (`beforeAll`, …) and focus/skip variants are all
  //    treated equally.
  const testCallee = testCalleeOfParent(node);
  if (testCallee) {
    return {
      shape: "test_callback",
      shapeEvidence: [`callback passed to ${testCallee}(...)`],
    };
  }

  // 1b. cli_command_registrar — Commander.js DSL. Recognised as either
  //     the outer `registerXCommand(program)` wrapper, OR the anonymous
  //     callback passed to `.action(...)` on a `program.command(...)`
  //     chain. The chain is registration syntax, not branching logic, so
  //     it shouldn't be charged at domain thresholds.
  if (
    name &&
    isCommanderRegistrarName(name) &&
    (kind === "function" || kind === "function_expression" || kind === "arrow") &&
    bodyContainsCommanderChain(node)
  ) {
    return {
      shape: "cli_command_registrar",
      shapeEvidence: [
        `name matches register*Command`,
        `body contains Commander DSL chain`,
      ],
    };
  }
  if (
    (kind === "arrow" || kind === "function_expression") &&
    isCommanderActionCallbackArg(node)
  ) {
    return {
      shape: "cli_command_registrar",
      shapeEvidence: [`callback passed to Commander .action(...)`],
    };
  }

  // 2. route_handler — two flavours:
  //    (a) App Router: named export with HTTP-verb name under
  //        `(src/)?app/**` (typically `route.ts`).
  //    (b) Pages Router API: default export under `(src/)?pages/api/**`.
  if (
    name &&
    HTTP_VERBS.has(name) &&
    hasExportModifier(node) &&
    !hasDefaultModifierOnDeclaration(node) &&
    APP_ROUTER_DIR_RE.test(absolutePath)
  ) {
    return {
      shape: "route_handler",
      shapeEvidence: [
        `named export "${name}"`,
        `App Router route file`,
      ],
    };
  }
  if (
    isDefaultExportFunction(node) &&
    PAGES_ROUTER_API_RE.test(absolutePath)
  ) {
    return {
      shape: "route_handler",
      shapeEvidence: ["default export", "Pages Router API route"],
    };
  }

  // 3. page_export: default export under a conventional page file —
  //    App Router (`app/**/page.tsx` etc.) or Pages Router (`pages/**`
  //    excluding `pages/api/`).
  if (isDefaultExportFunction(node)) {
    if (
      APP_ROUTER_DIR_RE.test(absolutePath) &&
      APP_ROUTER_PAGE_FILE_RE.test(absolutePath)
    ) {
      return {
        shape: "page_export",
        shapeEvidence: ["default export", "App Router page file"],
      };
    }
    if (PAGES_ROUTER_PAGE_RE.test(absolutePath)) {
      return {
        shape: "page_export",
        shapeEvidence: ["default export", "Pages Router page file"],
      };
    }
  }

  // 4. react_component: PascalCase name AND body contains JSX. Live
  //    outside route directories (page_export already handled). Methods
  //    and constructors can't be React components.
  if (
    name &&
    isPascalCase(name) &&
    (kind === "function" ||
      kind === "arrow" ||
      kind === "function_expression") &&
    bodyContainsJsx(node)
  ) {
    return {
      shape: "react_component",
      shapeEvidence: [`PascalCase name "${name}"`, "body returns JSX"],
    };
  }

  // 5. domain — anything with a name that didn't match a more specific
  //    rule. The default bucket, including methods, constructors, and
  //    accessors.
  if (name) {
    return { shape: "domain", shapeEvidence: [] };
  }

  // 6. unknown — anonymous arrow / function expression. Falls back to a
  //    slightly relaxed threshold so god-functions hiding inside callbacks
  //    still surface, but ordinary inline anonymous helpers don't.
  return { shape: "unknown", shapeEvidence: [] };
}

/**
 * If `node` is an argument to a call whose callee identifier (or property
 * accessor tail, e.g. `vi.describe`) is in the test-framework set, return
 * that callee name. Otherwise `undefined`.
 */
function testCalleeOfParent(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return undefined;
  // Confirm the function is one of the call's arguments, not its callee.
  let isArgument = false;
  for (const arg of parent.arguments) {
    if (arg === node) {
      isArgument = true;
      break;
    }
  }
  if (!isArgument) return undefined;
  const callee = parent.expression;
  if (ts.isIdentifier(callee) && TEST_CALLEES.has(callee.text)) {
    return callee.text;
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    TEST_CALLEES.has(callee.name.text)
  ) {
    return callee.name.text;
  }
  return undefined;
}

/**
 * True when the node carries an `export` modifier — either directly (for
 * `FunctionDeclaration` / `ClassDeclaration`) or via the enclosing
 * `VariableStatement` (for arrow / function expressions assigned to
 * exported `const`s).
 */
function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    // Walk up to the nearest declaration with modifiers (typically the
    // `VariableStatement` two levels up for `export const X = ...`).
    let p: ts.Node | undefined = node.parent;
    while (p) {
      if (ts.canHaveModifiers(p)) {
        const m = ts.getModifiers(p);
        if (m?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) {
          return true;
        }
        return false;
      }
      p = p.parent;
    }
    return false;
  }
  const m = ts.getModifiers(node);
  return m?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * True when the node itself is `export default function …` /
 * `export default class …` (a declaration with both modifiers).
 */
function hasDefaultModifierOnDeclaration(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const m = ts.getModifiers(node);
  return m?.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

/**
 * True when the function is the value of an `export default` —
 * either `export default function Foo() {}` (declaration with both
 * modifiers) or `export default <expr>` (ExportAssignment over a
 * function/class/arrow). The latter is common with framework files like
 * `pages/api/foo.ts` (`export default function handler() {}` or
 * `export default async function handler() {}`).
 */
function isDefaultExportFunction(node: ts.Node): boolean {
  if (hasDefaultModifierOnDeclaration(node)) return true;
  const parent = node.parent;
  if (parent && ts.isExportAssignment(parent) && !parent.isExportEquals) {
    return true;
  }
  return false;
}

/**
 * Matches the `registerXCommand` naming convention used by Commander
 * builder DSL wrappers (e.g. `registerScanCommand`,
 * `registerIgnoreCommand`). Conservative: requires the literal
 * `register` prefix, a PascalCase tail, and a `Command` suffix.
 */
const COMMANDER_REGISTRAR_NAME_RE = /^register[A-Z][A-Za-z0-9]*Command$/;

function isCommanderRegistrarName(name: string): boolean {
  return COMMANDER_REGISTRAR_NAME_RE.test(name);
}

/**
 * True when `node`'s body contains an expression of the form
 * `<param>.command(...).…` — the Commander builder chain. Walks the
 * direct body statements rather than the whole tree so unrelated
 * `something.command(...)` calls elsewhere don't trip the heuristic.
 */
function bodyContainsCommanderChain(node: ts.Node): boolean {
  let body: ts.Node | undefined;
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  ) {
    body = node.body;
  } else if (ts.isArrowFunction(node)) {
    body = node.body;
  }
  if (!body) return false;

  if (ts.isBlock(body)) {
    for (const stmt of body.statements) {
      if (
        ts.isExpressionStatement(stmt) &&
        chainIncludesCommandCall(stmt.expression)
      ) {
        return true;
      }
      if (
        ts.isReturnStatement(stmt) &&
        stmt.expression &&
        chainIncludesCommandCall(stmt.expression)
      ) {
        return true;
      }
    }
    return false;
  }
  // ConciseBody: an arrow's expression-bodied form.
  return chainIncludesCommandCall(body as ts.Expression);
}

/**
 * Walk a method-call chain (`a.b().c().d()`) and return true if any
 * step in the chain is a `.command(...)` call. We don't enforce that
 * the chain root is literally an identifier named `program` — repos
 * sometimes alias it (`cmd`, `cli`), and the `.command(...)` step plus
 * the registrar function name is conservative enough.
 */
function chainIncludesCommandCall(expr: ts.Expression): boolean {
  let cursor: ts.Expression = expr;
  while (ts.isCallExpression(cursor)) {
    const callee = cursor.expression;
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.name) &&
      callee.name.text === "command"
    ) {
      return true;
    }
    if (ts.isPropertyAccessExpression(callee)) {
      cursor = callee.expression;
      continue;
    }
    return false;
  }
  return false;
}

/**
 * True when the function is an argument to a `.action(...)` call that
 * sits on a Commander builder chain (i.e. the chain contains a
 * `.command(...)` step somewhere upstream). The receiver may be any
 * identifier — see {@link chainIncludesCommandCall}.
 */
function isCommanderActionCallbackArg(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  let isArgument = false;
  for (const arg of parent.arguments) {
    if (arg === node) {
      isArgument = true;
      break;
    }
  }
  if (!isArgument) return false;
  const callee = parent.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ts.isIdentifier(callee.name) ||
    callee.name.text !== "action"
  ) {
    return false;
  }
  // The receiver of `.action(...)` should itself be a `.command(...)`
  // chain head — i.e. somewhere up the chain we hit a `.command(...)`
  // call.
  return chainIncludesCommandCall(callee.expression);
}

/**
 * Cheap PascalCase check: first character is uppercase ASCII, no
 * leading underscores, doesn't match an HTTP verb (those are
 * already-handled route handler names, not components).
 */
function isPascalCase(name: string): boolean {
  if (name.length === 0) return false;
  const first = name.charCodeAt(0);
  if (first < 65 || first > 90) return false; // 'A'..'Z'
  // Exclude all-caps acronym-only names (`API`, `URL`) — they aren't
  // components in practice. Allow PascalCase with internal caps.
  if (name === name.toUpperCase()) return false;
  return true;
}

/**
 * Walk the function's body looking for any JSX node. Returns `true` on
 * the first hit. Conservative and short-circuiting — a function with one
 * JSX return is enough to flip the shape, and we don't need to count.
 */
function bodyContainsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
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

/**
 * Collect a JSX root — a `JsxElement` / `JsxSelfClosingElement` / `JsxFragment`
 * that is not itself nested inside another JSX node. We rely on the parent
 * pointers set up by `createSourceFile(..., true, ...)` to short-circuit
 * nested elements; nested nodes are walked as children when their root is
 * processed, not as new roots.
 */
function collectJsxRoot(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  source: string,
  out: JsxElementInfo[],
): void {
  if (
    !ts.isJsxElement(node) &&
    !ts.isJsxSelfClosingElement(node) &&
    !ts.isJsxFragment(node)
  ) {
    return;
  }
  if (isInsideJsx(node)) return;

  if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        out.push(buildJsxElementInfo(child, sourceFile, source));
      }
    }
    return;
  }
  out.push(buildJsxElementInfo(node, sourceFile, source));
}

function isInsideJsx(node: ts.Node): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (
      ts.isJsxElement(p) ||
      ts.isJsxSelfClosingElement(p) ||
      ts.isJsxFragment(p)
    ) {
      return true;
    }
    p = p.parent;
  }
  return false;
}

function buildJsxElementInfo(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  source: string,
): JsxElementInfo {
  if (ts.isJsxSelfClosingElement(node)) {
    const name = jsxTagText(node.tagName) ?? "<unknown>";
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
      node.getEnd(),
    );
    return {
      name,
      lines: [startLine + 1, endLine + 1],
      attributes: buildAttributes(node.attributes, source),
      children: [],
      selfClosing: true,
    };
  }

  const opening = node.openingElement;
  const name = jsxTagText(opening.tagName) ?? "<unknown>";
  const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
    node.getEnd(),
  );
  const children: JsxNode[] = [];
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ").trim();
      if (text.length === 0) continue;
      children.push({ kind: "text", value: text });
      continue;
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      children.push({
        kind: "element",
        element: buildJsxElementInfo(child, sourceFile, source),
      });
      continue;
    }
    if (ts.isJsxFragment(child)) {
      for (const grand of child.children) {
        if (ts.isJsxElement(grand) || ts.isJsxSelfClosingElement(grand)) {
          children.push({
            kind: "element",
            element: buildJsxElementInfo(grand, sourceFile, source),
          });
        }
      }
    }
    // JsxExpression and other shapes are intentionally dropped from the
    // child list — we only carry statically representable values.
  }
  return {
    name,
    lines: [startLine + 1, endLine + 1],
    attributes: buildAttributes(opening.attributes, source),
    children,
    selfClosing: false,
  };
}

function buildAttributes(
  attrs: ts.JsxAttributes,
  source: string,
): Map<string, JsxAttributeValue> {
  const out = new Map<string, JsxAttributeValue>();
  for (const attr of attrs.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      const exprSrc = source.slice(attr.expression.getStart(), attr.expression.getEnd());
      out.set(`...${exprSrc}`, { kind: "spread", source: exprSrc });
      continue;
    }
    if (!ts.isJsxAttribute(attr)) continue;
    const name = jsxAttrName(attr.name);
    if (!name) continue;
    const init = attr.initializer;
    if (init === undefined) {
      out.set(name, { kind: "boolean", value: true });
      continue;
    }
    if (ts.isStringLiteral(init)) {
      out.set(name, { kind: "string", value: init.text });
      continue;
    }
    if (ts.isJsxExpression(init)) {
      if (init.expression === undefined) continue;
      const expr = init.expression;
      if (
        ts.isStringLiteral(expr) ||
        ts.isNoSubstitutionTemplateLiteral(expr)
      ) {
        out.set(name, { kind: "string", value: expr.text });
        continue;
      }
      const exprSrc = source.slice(expr.getStart(), expr.getEnd());
      out.set(name, { kind: "expression", source: exprSrc });
    }
  }
  return out;
}

function jsxAttrName(name: ts.JsxAttributeName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  // JsxNamespacedName ("xmlns:foo") — keep the joined form so detectors can
  // pattern-match on the full attribute text.
  if (ts.isJsxNamespacedName(name)) {
    return `${name.namespace.text}:${name.name.text}`;
  }
  return undefined;
}

function jsxTagText(tag: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) {
    const head = jsxTagText(tag.expression);
    const tail = tag.name.text;
    return head ? `${head}.${tail}` : tail;
  }
  if (ts.isJsxNamespacedName(tag)) {
    return `${tag.namespace.text}:${tag.name.text}`;
  }
  return undefined;
}
