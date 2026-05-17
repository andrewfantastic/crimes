// Strict-TS small module — well-tested, well-scoped, zero findings expected.
export interface Money {
  amount: number;
  currency: "USD" | "EUR" | "GBP";
}

export function format(money: Money): string {
  const { amount, currency } = money;
  return `${currency} ${amount.toFixed(2)}`;
}
