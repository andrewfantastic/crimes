/**
 * Structural fingerprints for function bodies and JSX subtrees.
 *
 * Used by the duplication detectors (`exact_duplicate_block`,
 * `near_duplicate_block`) and `duplicate_component_shape` to identify
 * near-duplicates without re-parsing the same source.
 *
 * Two hashes per candidate:
 *
 *   - **exact** — SHA-1 of the normalised token stream (whitespace and
 *     comments stripped, identifier names preserved). Two functions are
 *     "exactly the same" when their exact hashes match.
 *   - **shape** — SHA-1 of the same stream with identifier names replaced
 *     by positional tokens (`$0`, `$1`, …). Two functions have "the same
 *     shape" when their shape hashes match, regardless of variable names.
 */

import { createHash } from "node:crypto";
import type { JsxElementInfo, ParsedFunction } from "@crimes/language-js";
import ts from "typescript";

export interface AstHash {
  /** Exact-tokens SHA-1, hex. */
  exact: string;
  /** Structural-tokens SHA-1, hex (identifier names → `$N`). */
  shape: string;
  /** Token count. Useful for filtering trivially short candidates. */
  tokens: number;
}

/**
 * Hash a parsed function. The slice covers the line range the parser
 * captured (signature + body) so the hash reflects the full function the
 * detector reasons about, not just the body.
 */
export function hashFunction(fn: ParsedFunction, source: string): AstHash {
  return hashSlice(sliceLines(source, fn.startLine, fn.endLine));
}

/**
 * Hash a JSX subtree. The slice covers the element's full line range as
 * captured during parsing.
 */
export function hashJsxSubtree(el: JsxElementInfo, source: string): AstHash {
  return hashSlice(sliceLines(source, el.lines[0], el.lines[1]));
}

/**
 * Hash an arbitrary source slice. Public because some detectors compare
 * raw code blocks that don't correspond to a parsed function (e.g.
 * `exact_duplicate_block` walking line windows).
 */
export function hashSlice(slice: string): AstHash {
  const tokens = tokenise(slice);
  if (tokens.length === 0) {
    return { exact: emptyHash(), shape: emptyHash(), tokens: 0 };
  }
  const exact = sha1(tokens.map(tokenText).join(" "));
  const shape = sha1(buildShapeStream(tokens).join(" "));
  return { exact, shape, tokens: tokens.length };
}

interface Token {
  kind: ts.SyntaxKind;
  /** Source text of the token. Empty for kinds where text is implied by kind. */
  text: string;
}

/**
 * Tokenise a slice using TypeScript's scanner. Whitespace, comments,
 * and EOF are dropped; everything else is preserved as a `Token` with
 * its source text (for identifiers / literals) or its kind (for
 * punctuators / keywords).
 */
function tokenise(slice: string): Token[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ true,
    ts.LanguageVariant.JSX,
    slice,
  );
  const tokens: Token[] = [];
  // Cap to keep pathological inputs bounded.
  const MAX_TOKENS = 50_000;
  for (let i = 0; i < MAX_TOKENS; i++) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    if (isTrivia(kind)) continue;
    tokens.push({ kind, text: scanner.getTokenText() });
  }
  return tokens;
}

function isTrivia(kind: ts.SyntaxKind): boolean {
  switch (kind) {
    case ts.SyntaxKind.WhitespaceTrivia:
    case ts.SyntaxKind.NewLineTrivia:
    case ts.SyntaxKind.SingleLineCommentTrivia:
    case ts.SyntaxKind.MultiLineCommentTrivia:
    case ts.SyntaxKind.ShebangTrivia:
    case ts.SyntaxKind.ConflictMarkerTrivia:
      return true;
    default:
      return false;
  }
}

function tokenText(token: Token): string {
  // Identifiers and literals: preserve verbatim. Punctuators and keywords:
  // prefer source text when available, fall back to kind for synthetic.
  return token.text || `<k${token.kind}>`;
}

/**
 * Build the shape-stream — same tokens, but identifier names are
 * replaced by positional placeholders. The first time we see a given
 * identifier text, it gets `$0`; the second new name gets `$1`; etc.
 * Repeated occurrences of the same name reuse the same placeholder so
 * `let a = a + 1` shape-collides with `let b = b + 1` but NOT with
 * `let a = b + 1`.
 */
function buildShapeStream(tokens: Token[]): string[] {
  const out: string[] = [];
  const namesSeen = new Map<string, string>();
  for (const t of tokens) {
    if (t.kind === ts.SyntaxKind.Identifier) {
      let placeholder = namesSeen.get(t.text);
      if (placeholder === undefined) {
        placeholder = `$${namesSeen.size}`;
        namesSeen.set(t.text, placeholder);
      }
      out.push(placeholder);
      continue;
    }
    out.push(tokenText(t));
  }
  return out;
}

function sliceLines(source: string, start: number, end: number): string {
  const lines = source.split(/\r?\n/);
  if (start < 1) start = 1;
  if (end > lines.length) end = lines.length;
  return lines.slice(start - 1, end).join("\n");
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function emptyHash(): string {
  return sha1("");
}
