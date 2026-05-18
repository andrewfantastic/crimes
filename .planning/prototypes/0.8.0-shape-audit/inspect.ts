// Throwaway: walks files, parses them, and prints the shape assigned
// to every function regardless of size. Used to audit whether the
// 0.4.0 shape classifier picks the right shape for the kinds of
// files where sync_io_in_hotpath needs to gate.

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import fg from "fast-glob";
import { parseFile } from "../../../packages/language-js/src/index.js";

interface Row {
  file: string;
  name: string;
  shape: string;
  startLine: number;
  endLine: number;
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

  const rows: Row[] = [];
  for (const f of files) {
    const source = await readFile(f, "utf8");
    const parsed = parseFile({ absolutePath: f, source });
    for (const fn of parsed.functions) {
      rows.push({
        file: relative(target, f),
        name: fn.name ?? "(anonymous)",
        shape: fn.shape,
        startLine: fn.startLine,
        endLine: fn.endLine,
      });
    }
  }

  const byShape = new Map<string, number>();
  for (const r of rows) {
    byShape.set(r.shape, (byShape.get(r.shape) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    target,
    files_scanned: files.length,
    total_functions: rows.length,
    by_shape: Object.fromEntries(
      Array.from(byShape.entries()).sort(([, a], [, b]) => b - a),
    ),
    samples: {
      route_handler: rows.filter(r => r.shape === "route_handler").slice(0, 6),
      page_export: rows.filter(r => r.shape === "page_export").slice(0, 6),
      react_component: rows.filter(r => r.shape === "react_component").slice(0, 6),
      cli_command_registrar: rows.filter(r => r.shape === "cli_command_registrar").slice(0, 6),
    },
  }, null, 2));
}

main().catch((err) => {
  process.stderr.write(`shape audit failed: ${err.message}\n`);
  process.exit(1);
});
