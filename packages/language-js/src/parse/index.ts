import { extname } from "node:path";
import ts from "typescript";
import {
  collectDateArithmetic,
  collectDateMethodCall,
  collectDateStringConcat,
  collectDateUse,
} from "./dates.js";
import { collectTypedDeclaration } from "./declarations.js";
import { collectFunction } from "./functions.js";
import { collectJsxRoot } from "./jsx.js";
import { collectTopLevelNavLiterals } from "./nav.js";
import { collectUiStringLiteral } from "./ui-strings.js";
import {
  countNonEmptyLines,
  extractDefaultExport,
  pickScriptKind,
} from "./utils.js";
import type {
  DateArithmetic,
  DateMethodCall,
  DateStringConcat,
  DateUse,
  JsxElementInfo,
  NavLiteral,
  ParseInput,
  ParsedFile,
  ParsedFunction,
  TypedDeclaration,
  UiStringLiteral,
} from "./types.js";

// Re-export every public type from the parse module so external imports
// (`import type { ParsedFile, ... } from "@crimes/language-js"`) keep
// working unchanged after the 0.7.0 split.
export type {
  DateArithmetic,
  DateMethodCall,
  DateStringConcat,
  DateUse,
  DeclarationKind,
  FunctionKind,
  FunctionShape,
  InitializerKind,
  JsxAttributeValue,
  JsxElementInfo,
  JsxNode,
  NavLiteral,
  NavLiteralEntry,
  ParsedFile,
  ParsedFunction,
  ParseInput,
  TypedDeclaration,
  UiStringContext,
  UiStringLiteral,
} from "./types.js";

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
  const dateMethodCalls: DateMethodCall[] = [];
  const dateArithmetic: DateArithmetic[] = [];
  const dateStringConcats: DateStringConcat[] = [];
  const typedDeclarations: TypedDeclaration[] = [];
  const navLiterals: NavLiteral[] = [];
  const uiStringLiterals: UiStringLiteral[] = [];
  const jsxElements: JsxElementInfo[] = [];
  let defaultExport: string | undefined;

  const visit = (node: ts.Node): void => {
    collectFunction(node, sourceFile, functions, input.absolutePath);
    collectDateUse(node, sourceFile, dateUses);
    collectDateMethodCall(node, sourceFile, dateMethodCalls);
    collectDateArithmetic(node, sourceFile, dateArithmetic);
    collectDateStringConcat(node, sourceFile, dateStringConcats);
    collectTypedDeclaration(node, sourceFile, typedDeclarations);
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
  if (dateMethodCalls.length > 0) result.dateMethodCalls = dateMethodCalls;
  if (dateArithmetic.length > 0) result.dateArithmetic = dateArithmetic;
  if (dateStringConcats.length > 0) result.dateStringConcats = dateStringConcats;
  if (typedDeclarations.length > 0) result.typedDeclarations = typedDeclarations;
  return result;
}
