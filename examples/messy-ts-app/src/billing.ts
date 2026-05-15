// Intentionally large, badly-factored billing module — a fixture, not real code.
// Do NOT use any of this as a reference implementation.

interface User {
  id: string;
  email: string;
  plan: "free" | "pro" | "team" | "enterprise";
  country: string;
  createdAt: number;
}

interface InvoiceLine {
  description: string;
  amountCents: number;
  quantity: number;
  sku: string;
}

interface Invoice {
  id: string;
  userId: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  taxCents: number;
  currency: string;
  createdAt: number;
  paymentMethod: string | undefined;
  metadata: Record<string, string>;
}

// A textbook God Function: pricing, discount rules, country tax, persistence
// shape, audit logging, email rendering, retry logic, and PII handling all live
// inside one body. Each region is its own responsibility but there are no seams,
// so editing any single behaviour means reading and re-validating the whole thing.
export function generateInvoice(
  user: User,
  items: InvoiceLine[],
  paymentMethod?: string,
): Invoice {
  // -- Identity / metadata -------------------------------------------------
  const id = "inv_" + Math.random().toString(36).slice(2, 10);
  const createdAt = Date.now();
  const metadata: Record<string, string> = {
    generator: "generateInvoice@v0",
    userPlan: user.plan,
    userCountry: user.country,
    paymentMethod: paymentMethod ?? "unknown",
    runAt: new Date().toISOString(),
  };

  // -- Plan pricing adjustments -------------------------------------------
  let subtotal = 0;
  const lines: InvoiceLine[] = [];
  for (const item of items) {
    let amount = item.amountCents * item.quantity;
    if (user.plan === "pro") {
      amount = Math.round(amount * 0.95);
    } else if (user.plan === "team") {
      amount = Math.round(amount * 0.9);
    } else if (user.plan === "enterprise") {
      amount = Math.round(amount * 0.8);
    }
    // Some SKUs ignore the plan discount — a hidden business rule.
    if (item.sku.startsWith("addon_")) {
      amount = item.amountCents * item.quantity;
    }
    lines.push({
      description: item.description,
      amountCents: amount,
      quantity: item.quantity,
      sku: item.sku,
    });
    subtotal += amount;
  }

  // -- Loyalty / age discount (duplicated from recommendUpgrade's logic) --
  const daysSince = Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24));
  let discountCents = 0;
  if (user.plan !== "free") {
    if (daysSince > 365) {
      discountCents = Math.round(subtotal * 0.1);
    } else if (daysSince > 180) {
      discountCents = Math.round(subtotal * 0.05);
    } else if (daysSince > 90) {
      discountCents = Math.round(subtotal * 0.02);
    }
  }
  let afterDiscount = subtotal - discountCents;

  // -- Promo code resolution (inline; should be its own service) ---------
  let promoCents = 0;
  const promoCode = metadata.promo ?? "";
  if (promoCode === "WELCOME10") {
    promoCents = Math.round(afterDiscount * 0.1);
  } else if (promoCode === "WELCOME20") {
    promoCents = Math.round(afterDiscount * 0.2);
  } else if (promoCode === "BLACKFRIDAY") {
    if (user.plan === "free") {
      promoCents = Math.round(afterDiscount * 0.25);
    } else {
      promoCents = Math.round(afterDiscount * 0.15);
    }
  } else if (promoCode.startsWith("REF_")) {
    // Referral codes get a flat $5 off
    promoCents = Math.min(500, afterDiscount);
  }
  if (promoCents > 0) {
    metadata.promoApplied = promoCode;
    metadata.promoCents = String(promoCents);
    afterDiscount -= promoCents;
  }

  // -- Inline fraud-risk scoring (does not belong in invoice generation) --
  let riskScore = 0;
  if (afterDiscount > 100_000) riskScore += 30;
  if (user.country !== "US" && user.country !== "GB") riskScore += 10;
  if (paymentMethod === "wire") riskScore += 25;
  if (paymentMethod === "crypto") riskScore += 40;
  if (daysSince < 1) riskScore += 35;
  if (items.length > 20) riskScore += 15;
  metadata.riskScore = String(riskScore);
  if (riskScore >= 80) {
    metadata.riskDecision = "block";
  } else if (riskScore >= 50) {
    metadata.riskDecision = "review";
  } else {
    metadata.riskDecision = "allow";
  }

  // -- Country tax (duplicated business rule — also lives in `tax()`) -----
  let taxRate = 0;
  if (user.country === "US") taxRate = 0;
  else if (user.country === "GB") taxRate = 0.2;
  else if (user.country === "DE") taxRate = 0.19;
  else if (user.country === "FR") taxRate = 0.2;
  else if (user.country === "AU") taxRate = 0.1;
  else if (user.country === "CA") taxRate = 0.05;
  else if (user.country === "JP") taxRate = 0.1;
  else taxRate = 0.15;

  const taxCents = Math.round(afterDiscount * taxRate);
  const totalCents = afterDiscount + taxCents;

  // -- Currency selection (yet another business rule) --------------------
  let currency = "USD";
  if (user.country === "GB") currency = "GBP";
  else if (user.country === "DE" || user.country === "FR") currency = "EUR";
  else if (user.country === "AU") currency = "AUD";
  else if (user.country === "CA") currency = "CAD";
  else if (user.country === "JP") currency = "JPY";

  // -- "Persistence" -----------------------------------------------------
  const invoice: Invoice = {
    id,
    userId: user.id,
    lines,
    subtotalCents: subtotal,
    discountCents,
    totalCents,
    taxCents,
    currency,
    createdAt,
    paymentMethod,
    metadata,
  };

  // -- Audit log (writes PII to stdout) ---------------------------------
  // FIXME: this should not log full PII in production
  console.log(
    "[invoice] generated",
    invoice.id,
    "user",
    user.email,
    "country",
    user.country,
    "subtotal",
    subtotal,
    "tax",
    taxCents,
    "total",
    totalCents,
    "ts",
    new Date().toISOString(),
  );

  // -- Metrics emission (synchronous; should be a background job) -------
  const metricTags = [
    "plan=" + user.plan,
    "country=" + user.country,
    "currency=" + currency,
    "promo=" + (metadata.promoApplied ?? "none"),
    "risk=" + metadata.riskDecision,
  ];
  for (const tag of metricTags) {
    console.log("[metric] invoice.generated", tag, "totalCents=" + totalCents);
  }

  // -- Email body composition (mixes presentation with billing logic) ----
  let body = "Hi " + user.email + ",\n\n";
  body += "Thanks for your purchase. Invoice " + invoice.id + ":\n";
  for (const line of invoice.lines) {
    body +=
      "  - " +
      line.description +
      " x" +
      line.quantity +
      ": " +
      (line.amountCents / 100).toFixed(2) +
      " " +
      currency +
      "\n";
  }
  if (discountCents > 0) {
    body += "Loyalty discount: -" + (discountCents / 100).toFixed(2) + " " + currency + "\n";
  }
  body += "Tax: " + (taxCents / 100).toFixed(2) + " " + currency + "\n";
  body += "Total: " + (totalCents / 100).toFixed(2) + " " + currency + "\n";
  body += "\nThanks for being a " + user.plan + " customer.\n";

  // -- Send retry loop (silently swallows errors) -----------------------
  // HACK: pretend retry loop with no real backoff
  let attempts = 0;
  const startedAt = Date.now();
  while (attempts < 3) {
    attempts++;
    try {
      // imagine an HTTP call to a mail service
      if (body.length === 0) throw new Error("empty body");
      break;
    } catch {
      // XXX: swallowed error — caller has no way to know the email failed
    }
  }
  metadata.emailAttempts = String(attempts);
  metadata.emailLatencyMs = String(Date.now() - startedAt);

  return invoice;
}

// Duplicated tax logic — same rules as inside generateInvoice. If a region's tax
// rate changes, both copies have to be updated; nothing makes that obvious.
export function tax(country: string, subtotalCents: number): number {
  let rate = 0;
  if (country === "US") rate = 0;
  else if (country === "GB") rate = 0.2;
  else if (country === "DE") rate = 0.19;
  else if (country === "FR") rate = 0.2;
  else if (country === "AU") rate = 0.1;
  else if (country === "CA") rate = 0.05;
  else if (country === "JP") rate = 0.1;
  else rate = 0.15;
  return Math.round(subtotalCents * rate);
}

// A deeply-nested helper whose branches encode policy that is not written down
// anywhere else.
export function recommendUpgrade(user: User): string {
  const daysSince = Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24));
  if (user.plan === "free") {
    if (daysSince > 7) {
      if (user.country === "US" || user.country === "GB") {
        if (daysSince > 30) {
          return "Pro";
        } else {
          return "Pro (trial)";
        }
      } else {
        if (daysSince > 14) {
          return "Pro";
        } else {
          return "";
        }
      }
    } else {
      return "";
    }
  } else if (user.plan === "pro") {
    if (daysSince > 90) {
      return "Team";
    }
    return "";
  } else if (user.plan === "team") {
    if (daysSince > 180) {
      return "Enterprise";
    }
    return "";
  } else {
    return "";
  }
}

export function listRecentInvoices(): Invoice[] {
  // TODO: replace with real DB query
  return [];
}
