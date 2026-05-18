// Quick prototype: identify stop-word-named *exported* symbols.
// The angle is "ESLint's id-denylist is global; we scope to exports
// because that's where naming actually misleads downstream."
//
// Run:   pnpm tsx .planning/prototypes/0.8.0-stop-word-exports/run.ts [dir]

import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import fg from "fast-glob";
import ts from "typescript";

const STOP_WORDS = new Set([
  // generic data containers
  "data", "info", "obj", "item", "thing", "stuff", "value", "result",
  "temp", "tmp", "x", "y", "z",
  // generic action / role
  "handle", "process", "manage", "perform",
  // generic suffix-style
  "Manager", "Handler", "Helper", "Util", "Utils", "Wrapper", "Worker",
  "Service", "Factory", "Maker", "Processor",
]);

interface Finding {
  file: string;
  line: number;
  name: string;
  kind: "function" | "variable" | "class" | "type" | "interface";
  isDefault: boolean;
}

async function scanFile(absPath: string, root: string): Promise<Finding[]> {
  const source = await readFile(absPath, "utf8");
  const file = relative(root, absPath);
  const ext = extname(absPath).toLowerCase();
  const scriptKind =
    ext === ".tsx" ? ts.ScriptKind.TSX :
    ext === ".jsx" ? ts.ScriptKind.JSX :
    ext === ".js" || ext === ".mjs" || ext === ".cjs" ? ts.ScriptKind.JS :
    ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const out: Finding[] = [];

  for (const stmt of sf.statements) {
    const modifiers = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) ?? [] : [];
    const hasExport = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const hasDefault = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (!hasExport) continue;

    const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;

    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      if (STOP_WORDS.has(stmt.name.text)) {
        out.push({ file, line, name: stmt.name.text, kind: "function", isDefault: hasDefault });
      }
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && STOP_WORDS.has(decl.name.text)) {
          out.push({ file, line, name: decl.name.text, kind: "variable", isDefault: false });
        }
      }
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      if (STOP_WORDS.has(stmt.name.text)) {
        out.push({ file, line, name: stmt.name.text, kind: "class", isDefault: hasDefault });
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      if (STOP_WORDS.has(stmt.name.text)) {
        out.push({ file, line, name: stmt.name.text, kind: "type", isDefault: false });
      }
    } else if (ts.isInterfaceDeclaration(stmt)) {
      if (STOP_WORDS.has(stmt.name.text)) {
        out.push({ file, line, name: stmt.name.text, kind: "interface", isDefault: false });
      }
    }
  }

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
      "**/*.d.ts",
    ],
  });

  const all: Finding[] = [];
  for (const f of files) all.push(...(await scanFile(f, target)));

  const byName = new Map<string, Finding[]>();
  for (const f of all) {
    const list = byName.get(f.name) ?? [];
    list.push(f);
    byName.set(f.name, list);
  }

  console.log(JSON.stringify({
    target,
    files_scanned: files.length,
    total_findings: all.length,
    by_name: Object.fromEntries(
      Array.from(byName.entries())
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([k, v]) => [k, { count: v.length, samples: v.slice(0, 5) }]),
    ),
  }, null, 2));
}

main().catch((err) => {
  process.stderr.write(`stop-word prototype failed: ${err.message}\n`);
  process.exit(1);
});
