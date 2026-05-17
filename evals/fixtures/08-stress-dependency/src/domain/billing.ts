// Layer violation: domain code imports from presentation.
import { renderInvoice } from "../presentation/invoice-view.js";

export function chargeCustomer(amount: number): string {
  return renderInvoice(amount);
}
