import { describe, expect, it } from "vitest";
import { parseFile } from "./parse.js";

function parse(source: string, ext = ".ts") {
  return parseFile({ absolutePath: `/tmp/x${ext}`, source });
}

describe("parseFile", () => {
  it("counts non-empty lines", () => {
    const result = parse("a\nb\nc\n");
    expect(result.lineCount).toBe(3);
  });

  it("captures function declarations with names", () => {
    const src = `function foo(a: number) {\n  return a;\n}\n`;
    const result = parse(src);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe("foo");
    expect(result.functions[0]!.kind).toBe("function");
    expect(result.functions[0]!.startLine).toBe(1);
    expect(result.functions[0]!.endLine).toBe(3);
  });

  it("captures methods and constructors", () => {
    const src = `class A {\n  constructor() {}\n  m() { return 1; }\n}\n`;
    const result = parse(src);
    const kinds = result.functions.map((f) => f.kind).sort();
    expect(kinds).toEqual(["constructor", "method"]);
  });

  it("infers names for arrow functions assigned to variables", () => {
    const src = `const greet = (name: string) => 'hi ' + name;\n`;
    const result = parse(src);
    expect(result.functions[0]!.name).toBe("greet");
    expect(result.functions[0]!.kind).toBe("arrow");
  });

  it("captures Date.now() and new Date() uses with line numbers", () => {
    const src = `const a = Date.now();\nconst b = new Date('2026-01-01');\n`;
    const result = parse(src);
    expect(result.dateNowOrNewDateUses).toEqual([
      { kind: "now", line: 1 },
      { kind: "new", line: 2 },
    ]);
  });

  it("parses TSX without throwing", () => {
    const src = `export const Hello = () => <div>hi</div>;\n`;
    const result = parse(src, ".tsx");
    expect(result.functions).toHaveLength(1);
  });
});
