import { describe, expect, it } from "vitest";
import { format } from "./billing.js";

describe("format", () => {
  it("renders USD", () => {
    expect(format({ amount: 12.5, currency: "USD" })).toBe("USD 12.50");
  });

  it("renders EUR", () => {
    expect(format({ amount: 7, currency: "EUR" })).toBe("EUR 7.00");
  });
});
