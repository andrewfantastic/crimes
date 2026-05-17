import { chargeCustomer } from "../domain/billing.js";
// Deep import — should flag deep_import detector.
import { internalHelper } from "../../node_modules/some-pkg/dist/internal/private/helper.js";

export function runBillingFlow(): void {
  chargeCustomer(100);
  internalHelper();
}
