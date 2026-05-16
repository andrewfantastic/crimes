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

describe("parseFile — default export", () => {
  it("captures `export default function Foo`", () => {
    const result = parse(`export default function Foo() { return 1; }\n`);
    expect(result.defaultExport).toBe("Foo");
  });

  it("captures `export default class Foo`", () => {
    const result = parse(`export default class Foo { run() {} }\n`);
    expect(result.defaultExport).toBe("Foo");
  });

  it("captures `export default Identifier`", () => {
    const src = `const PricingPage = () => null;\nexport default PricingPage;\n`;
    const result = parse(src);
    expect(result.defaultExport).toBe("PricingPage");
  });

  it("captures `export { Foo as default }`", () => {
    const src = `function Foo() {}\nexport { Foo as default };\n`;
    const result = parse(src);
    expect(result.defaultExport).toBe("Foo");
  });

  it("leaves defaultExport undefined when there is no default export", () => {
    const result = parse(`export const x = 1;\n`);
    expect(result.defaultExport).toBeUndefined();
  });

  it("leaves defaultExport undefined for anonymous default arrows", () => {
    const result = parse(`export default () => null;\n`);
    expect(result.defaultExport).toBeUndefined();
  });
});

describe("parseFile — nav literals", () => {
  it("captures a top-level nav array assigned to a variable", () => {
    const src = `
      const sidebar = [
        { href: "/settings/billing", label: "Billing" },
        { href: "/team", label: "Team" },
      ];
    `;
    const result = parse(src);
    expect(result.navLiterals).toHaveLength(1);
    const nav = result.navLiterals![0]!;
    expect(nav.identifier).toBe("sidebar");
    expect(nav.entries.map((e) => e.destination)).toEqual([
      "/settings/billing",
      "/team",
    ]);
    expect(nav.entries.map((e) => e.label)).toEqual(["Billing", "Team"]);
  });

  it("handles `as const` and `satisfies` wrappers", () => {
    const src = `
      export const items = [
        { path: "/a", title: "A" },
        { path: "/b", title: "B" },
      ] as const;
    `;
    const result = parse(src);
    expect(result.navLiterals).toHaveLength(1);
    expect(result.navLiterals![0]!.entries[0]!.destination).toBe("/a");
  });

  it("captures non-key attributes on entries", () => {
    const src = `
      const nav = [
        { href: "/admin", label: "Admin", permission: "owner" },
        { href: "/billing", label: "Billing", permission: "billing.manage" },
      ];
    `;
    const result = parse(src);
    const entries = result.navLiterals![0]!.entries;
    expect(entries[0]!.attributes.permission).toBe("owner");
    expect(entries[1]!.attributes.permission).toBe("billing.manage");
  });

  it("does not fire on arrays without any destination+label entry", () => {
    const src = `
      const counts = [
        { count: "1" },
        { count: "2" },
      ];
    `;
    const result = parse(src);
    expect(result.navLiterals).toEqual([]);
  });

  it("does not fire on single-element arrays", () => {
    const src = `
      const x = [{ href: "/a", label: "A" }];
    `;
    const result = parse(src);
    expect(result.navLiterals).toEqual([]);
  });

  it("captures `export default [...]` nav arrays", () => {
    const src = `
      export default [
        { to: "/a", name: "A" },
        { to: "/b", name: "B" },
      ];
    `;
    const result = parse(src);
    expect(result.navLiterals).toHaveLength(1);
    expect(result.navLiterals![0]!.identifier).toBe("default");
  });
});

describe("parseFile — UI string literals", () => {
  it("captures <title>X</title>", () => {
    const result = parse(`export const Head = () => (<title>Subscription</title>);\n`, ".tsx");
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Subscription", context: "jsx_title" }),
    );
  });

  it("captures document.title = 'X'", () => {
    const result = parse(`document.title = "Plans";\n`);
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Plans", context: "document_title" }),
    );
  });

  it("captures useTitle('X')", () => {
    const result = parse(`useTitle("Subscription");\n`);
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Subscription", context: "use_title" }),
    );
  });

  it("captures setTitle('X')", () => {
    const result = parse(`setTitle("Plans");\n`);
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Plans", context: "use_title" }),
    );
  });

  it("captures `export const metadata = { title: 'X' }`", () => {
    const result = parse(`export const metadata = { title: "Billing" };\n`);
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Billing", context: "metadata_title" }),
    );
  });

  it("captures <Breadcrumb label='X' />", () => {
    const result = parse(`const X = <Breadcrumb label="Billing" />;\n`, ".tsx");
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({
        value: "Billing",
        context: "jsx_label",
        source: "Breadcrumb",
      }),
    );
  });

  it("captures <NavLink title='X'>...</NavLink>", () => {
    const result = parse(
      `const X = <NavLink title="Settings">stuff</NavLink>;\n`,
      ".tsx",
    );
    expect(result.uiStringLiterals).toContainEqual(
      expect.objectContaining({ value: "Settings", context: "jsx_label" }),
    );
  });

  it("does not fire on arbitrary string literals", () => {
    const result = parse(`const x = "Just a string";\n`);
    expect(result.uiStringLiterals).toEqual([]);
  });

  it("skips JSX titles with mixed content", () => {
    const result = parse(
      `const X = <title>Settings — {productName}</title>;\n`,
      ".tsx",
    );
    expect(result.uiStringLiterals).toEqual([]);
  });
});
