// Circular dependency: presentation imports application which imports domain
// which imports presentation (via chargeCustomer).
import { runBillingFlow } from "../application/billing-flow.js";

export function renderInvoice(amount: number): string {
  runBillingFlow();
  return `Invoice: ${amount}`;
}
