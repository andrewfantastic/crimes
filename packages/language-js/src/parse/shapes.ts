import type ts from "typescript";
import {
  APP_ROUTER_DIR_RE,
  APP_ROUTER_PAGE_FILE_RE,
  HTTP_VERBS,
  PAGES_ROUTER_API_RE,
  PAGES_ROUTER_PAGE_RE,
} from "./constants.js";
import {
  bodyContainsCommanderChain,
  isCommanderActionCallbackArg,
  isCommanderRegistrarName,
} from "./shape-commander.js";
import {
  bodyContainsJsx,
  hasDefaultModifierOnDeclaration,
  hasExportModifier,
  isDefaultExportFunction,
  isPascalCase,
  testCalleeOfParent,
} from "./shape-predicates.js";
import type { FunctionKind, FunctionShape } from "./types.js";

/**
 * Decide the {@link FunctionShape} for a parsed function. Rules are
 * evaluated in priority order — first match wins. The classification is
 * conservative: anything ambiguous falls through to `"domain"` (named) or
 * `"unknown"` (anonymous), so we never miss a real god-function that
 * happens to share AST shape with a test callback.
 */
export function classifyShape(args: {
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
