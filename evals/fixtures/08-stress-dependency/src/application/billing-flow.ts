import { chargeCustomer } from "../domain/billing.js";
// Deep import — bare specifier reaching into another package's internals.
// Should flag deep_import (≥3 segments past pkg name + private marker).
import { internalHelper } from "some-pkg/dist/internal/private/helper.js";

export function runBillingFlow(): void {
  chargeCustomer(100);
  internalHelper();
}
