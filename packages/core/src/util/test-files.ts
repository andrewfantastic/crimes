/**
 * Shared test-file classifier. Every detector / index that has a notion of
 * "this is a test file, treat it differently" reaches for these helpers so
 * the codebase has exactly one source of truth for the test-file naming
 * convention.
 *
 * Matches `*.test.[cm]?[jt]sx?`, `*.spec.[cm]?[jt]sx?`, and anything under
 * a `__tests__/` directory. Path separator is `/` — callers pass repo-
 * relative paths with forward slashes (which is the shape every detector
 * context exposes).
 */
export const TEST_FILE_RE =
  /(?:^|\/)(?:__tests__\/|.*\.(?:test|spec)\.[cm]?[jt]sx?$)/;

export function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}
