import { readFile } from "node:fs/promises";
import { basename, dirname, relative, sep } from "node:path";

/**
 * Matches every test-file naming convention `findLikelyTests` honours:
 *
 *   foo.test.ts / foo.spec.ts           — Jest / Vitest infix convention
 *   foo_test.ts / foo_spec.ts           — Go-style underscore suffix
 *
 * Used both to recognise candidate test files and to strip the suffix back
 * to a target basename for matching. Keep the two halves of the alternation
 * symmetric so `stripTestSuffix` stays a simple `.replace(TEST_EXT, "")`.
 */
export const TEST_EXT =
  /(?:\.(?:test|spec)|_(?:test|spec))\.(ts|tsx|js|jsx|mjs|cjs)$/;

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Discover the test files that likely cover `targetAbs`. Two passes:
 *
 *  1. Sibling files matching one of the test-naming conventions
 *     (`foo.test.ts`, `foo.spec.tsx`, `foo_test.ts`, `foo_spec.ts`)
 *     OR files under any `__tests__` directory with the same basename.
 *  2. Test files anywhere in the repo that import the target via a
 *     relative path — restricted to test files only so `likely_tests`
 *     doesn't list arbitrary consumers.
 */
export async function findLikelyTests(args: {
  root: string;
  fileRel: string;
  targetAbs: string;
  allFiles: string[];
}): Promise<string[]> {
  const { root, fileRel, targetAbs, allFiles } = args;
  const targetBaseNoExt = basename(fileRel).replace(SOURCE_EXT, "");
  const result = new Set<string>();

  for (const abs of allFiles) {
    if (abs === targetAbs) continue;
    const rel = toRepoPath(relative(root, abs));
    const b = basename(rel);

    if (TEST_EXT.test(b)) {
      const noTest = stripTestSuffix(b);
      if (noTest === targetBaseNoExt) {
        result.add(rel);
        continue;
      }
    }

    if (rel.split("/").includes("__tests__")) {
      const noTest = stripTestSuffix(b);
      if (noTest === targetBaseNoExt) {
        result.add(rel);
      }
    }
  }

  for (const abs of allFiles) {
    if (abs === targetAbs) continue;
    const rel = toRepoPath(relative(root, abs));
    if (result.has(rel)) continue;
    if (!isTestFile(rel)) continue;

    let source: string;
    try {
      source = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (importsTarget({ source, fromAbs: abs, targetAbs })) {
      result.add(rel);
    }
  }

  return [...result].sort();
}

export function isTestFile(rel: string): boolean {
  return TEST_EXT.test(basename(rel)) || rel.split("/").includes("__tests__");
}

/**
 * Strip a test-naming suffix from a basename to recover the "subject under
 * test" basename. Symmetric with {@link TEST_EXT} — `foo.test.ts` returns
 * `foo`, `foo_test.ts` returns `foo`. Returns the input unchanged when it
 * doesn't match either convention.
 */
function stripTestSuffix(basenameWithExt: string): string {
  return basenameWithExt.replace(TEST_EXT, "");
}

function importsTarget(args: {
  source: string;
  fromAbs: string;
  targetAbs: string;
}): boolean {
  const { source, fromAbs, targetAbs } = args;
  const fromDir = dirname(fromAbs);

  const targetNoExt = targetAbs.replace(SOURCE_EXT, "");
  let rel = relative(fromDir, targetNoExt);
  rel = rel.split(sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;

  const candidates = new Set<string>([
    rel,
    `${rel}.ts`,
    `${rel}.tsx`,
    `${rel}.js`,
    `${rel}.jsx`,
    `${rel}.mjs`,
    `${rel}.cjs`,
  ]);

  if (basename(targetNoExt) === "index") {
    const parent = rel.replace(/\/index$/, "");
    candidates.add(parent);
  }

  for (const c of candidates) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:from|require|import)\\s*\\(?\\s*["']${escaped}["']`,
    );
    if (re.test(source)) return true;
  }
  return false;
}

function toRepoPath(p: string): string {
  return p.split(sep).join("/");
}
