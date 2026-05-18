// Throwaway prototype for the six 0.8.0 date/time detectors.
// Walks a given directory's TS/JS files and runs the proposed
// heuristics. Output is per-detector finding count + sampled
// findings, intended to feed false-positive calibration into the
// research doc — not a production detector.
//
// Run:   pnpm tsx .planning/prototypes/0.8.0-date-prototypes/run.ts [dir]
// Output is JSON to stdout.

import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import fg from "fast-glob";
import ts from "typescript";

type DetectorId =
  | "timezone_unsafe_parse"
  | "mixed_utc_local_methods"
  | "locale_drift"
  | "dst_naive_arithmetic"
  | "date_string_concat"
  | "date_equality_misuse";

interface ProtoFinding {
  detector: DetectorId;
  file: string;
  line: number;
  evidence: string;
}

// ---------- Detector heuristics ----------

// 1. `new Date("…")` with no timezone marker in the string.
function detectTimezoneUnsafeParse(
  node: ts.Node,
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  if (!ts.isNewExpression(node)) return;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "Date") return;
  const args = node.arguments ?? [];
  if (args.length !== 1) return;
  const arg = args[0]!;
  let value: string | undefined;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    value = arg.text;
  }
  if (value === undefined) return;
  // Bare epoch numbers are safe (no parsing); 8601-with-offset/Z is safe.
  if (/^\d+$/.test(value)) return;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(value)) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  out.push({
    detector: "timezone_unsafe_parse",
    file,
    line,
    evidence: `new Date(${JSON.stringify(value)}) — string has no timezone marker, parsed in local TZ`,
  });
}

// 2. Same receiver identifier uses both UTC-named and local-named Date methods.
//    File-level analysis; emits one finding per offending receiver.
const UTC_METHODS = new Set([
  "getUTCFullYear",
  "getUTCMonth",
  "getUTCDate",
  "getUTCDay",
  "getUTCHours",
  "getUTCMinutes",
  "getUTCSeconds",
  "getUTCMilliseconds",
  "setUTCFullYear",
  "setUTCMonth",
  "setUTCDate",
  "setUTCHours",
  "setUTCMinutes",
  "setUTCSeconds",
  "setUTCMilliseconds",
  "toUTCString",
  "toISOString",
]);
const LOCAL_METHODS = new Set([
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "setFullYear",
  "setMonth",
  "setDate",
  "setHours",
  "setMinutes",
  "setSeconds",
  "setMilliseconds",
  "toDateString",
  "toTimeString",
  "toString",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
]);

function collectMixedUtcLocal(
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  type CallSite = { method: string; line: number };
  const utcByReceiver = new Map<string, CallSite[]>();
  const localByReceiver = new Map<string, CallSite[]>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const receiver = node.expression.expression.text;
      const method = node.expression.name.text;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (UTC_METHODS.has(method)) {
        const list = utcByReceiver.get(receiver) ?? [];
        list.push({ method, line });
        utcByReceiver.set(receiver, list);
      } else if (LOCAL_METHODS.has(method)) {
        const list = localByReceiver.get(receiver) ?? [];
        list.push({ method, line });
        localByReceiver.set(receiver, list);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const [receiver, utcCalls] of utcByReceiver) {
    const localCalls = localByReceiver.get(receiver);
    if (!localCalls || localCalls.length === 0) continue;
    const firstUtc = utcCalls[0]!;
    const firstLocal = localCalls[0]!;
    out.push({
      detector: "mixed_utc_local_methods",
      file,
      line: Math.min(firstUtc.line, firstLocal.line),
      evidence: `Receiver "${receiver}" uses both UTC and local Date methods: ` +
        `${firstUtc.method}() @L${firstUtc.line} and ${firstLocal.method}() @L${firstLocal.line}`,
    });
  }
}

// 3. `.toLocaleDateString()` / `.toLocaleString()` / `.toLocaleTimeString()` with no locale arg.
function detectLocaleDrift(
  node: ts.Node,
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  const method = node.expression.name.text;
  if (
    method !== "toLocaleDateString" &&
    method !== "toLocaleString" &&
    method !== "toLocaleTimeString"
  ) return;
  // No arguments → uses host default locale (varies per machine).
  if ((node.arguments?.length ?? 0) > 0) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  out.push({
    detector: "locale_drift",
    file,
    line,
    evidence: `.${method}() called with no locale — output varies by host locale`,
  });
}

// 4. Suspicious arithmetic constants near Date results.
//    Flag *known* day/hour/week multipliers when they appear in binary
//    expressions; defer broader patterns until we can constrain them.
const DAY_CONSTANTS = new Set([
  86400000,        // 24 * 60 * 60 * 1000
  604800000,       // 7 days
  2592000000,      // 30 days
  3600000,         // 1 hour
]);

function detectDstNaiveArithmetic(
  node: ts.Node,
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  if (!ts.isBinaryExpression(node)) return;
  const op = node.operatorToken.kind;
  if (op !== ts.SyntaxKind.PlusToken && op !== ts.SyntaxKind.MinusToken) return;
  const numeric = extractNumericLiteral(node.left) ?? extractNumericLiteral(node.right);
  if (numeric === undefined) return;
  if (!DAY_CONSTANTS.has(numeric)) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  out.push({
    detector: "dst_naive_arithmetic",
    file,
    line,
    evidence: `${numeric}ms constant in date arithmetic — DST/leap-second-naive day math`,
  });
}

function extractNumericLiteral(node: ts.Expression | undefined): number | undefined {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  // Folded multiplication like 24 * 60 * 60 * 1000 — best-effort
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
    const l = extractNumericLiteral(node.left);
    const r = extractNumericLiteral(node.right);
    if (l !== undefined && r !== undefined) return l * r;
  }
  return undefined;
}

// 5. String concatenation building date-like strings.
//    Conservative: only flag `+` where one operand is a Date-method
//    result and the other is a string literal.
function detectDateStringConcat(
  node: ts.Node,
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  if (!ts.isBinaryExpression(node)) return;
  if (node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return;
  const left = node.left;
  const right = node.right;
  const hasStr = ts.isStringLiteral(left) || ts.isStringLiteral(right);
  const dateCall = isDateMethodCall(left) || isDateMethodCall(right);
  if (!hasStr || !dateCall) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  out.push({
    detector: "date_string_concat",
    file,
    line,
    evidence: `String + Date-method concat — manual date formatting is error-prone`,
  });
}

function isDateMethodCall(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const method = node.expression.name.text;
  return UTC_METHODS.has(method) || LOCAL_METHODS.has(method);
}

// 6. `==` / `===` between Date-like expressions.
function detectDateEqualityMisuse(
  node: ts.Node,
  sf: ts.SourceFile,
  file: string,
  out: ProtoFinding[],
): void {
  if (!ts.isBinaryExpression(node)) return;
  const op = node.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.EqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken
  ) return;
  // Heuristic: receiver looks Date-y (named "date", "d", "*Date", "*At", "now")
  // OR is a `new Date()` expression.
  if (!looksLikeDate(node.left) || !looksLikeDate(node.right)) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  out.push({
    detector: "date_equality_misuse",
    file,
    line,
    evidence: `Date-typed equality with ${node.operatorToken.getText()} — compares references, not values`,
  });
}

function looksLikeDate(node: ts.Expression): boolean {
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
    return true;
  }
  if (ts.isIdentifier(node)) {
    const n = node.text.toLowerCase();
    if (n === "date" || n === "d" || n === "now") return true;
    if (n.endsWith("date") || n.endsWith("at") || n.endsWith("time")) return true;
  }
  return false;
}

// ---------- Scanner orchestration ----------

async function scanFile(absPath: string, root: string): Promise<ProtoFinding[]> {
  const source = await readFile(absPath, "utf8");
  const file = relative(root, absPath);
  const ext = extname(absPath).toLowerCase();
  const scriptKind =
    ext === ".tsx" ? ts.ScriptKind.TSX :
    ext === ".jsx" ? ts.ScriptKind.JSX :
    ext === ".js" || ext === ".mjs" || ext === ".cjs" ? ts.ScriptKind.JS :
    ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const out: ProtoFinding[] = [];

  // File-level pass (mixed_utc_local_methods needs aggregation).
  collectMixedUtcLocal(sf, file, out);

  // Per-node passes for the rest.
  const visit = (node: ts.Node): void => {
    detectTimezoneUnsafeParse(node, sf, file, out);
    detectLocaleDrift(node, sf, file, out);
    detectDstNaiveArithmetic(node, sf, file, out);
    detectDateStringConcat(node, sf, file, out);
    detectDateEqualityMisuse(node, sf, file, out);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

async function main(): Promise<void> {
  const target = resolve(process.argv[2] ?? process.cwd());
  const files = await fg("**/*.{ts,tsx,js,jsx,mjs,cjs}", {
    cwd: target,
    absolute: true,
    onlyFiles: true,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/*.min.js",
      "**/*.d.ts",
      "**/.crimes/**",
    ],
  });

  const allFindings: ProtoFinding[] = [];
  for (const f of files) {
    allFindings.push(...(await scanFile(f, target)));
  }

  const byDetector = new Map<DetectorId, ProtoFinding[]>();
  for (const f of allFindings) {
    const list = byDetector.get(f.detector) ?? [];
    list.push(f);
    byDetector.set(f.detector, list);
  }

  const summary = {
    target,
    files_scanned: files.length,
    total_findings: allFindings.length,
    by_detector: Object.fromEntries(
      Array.from(byDetector.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [
          k,
          {
            count: v.length,
            samples: v.slice(0, 5),
          },
        ]),
    ),
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`prototype failed: ${err.message}\n`);
  process.exit(1);
});
