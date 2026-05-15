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
}

interface Invoice {
  id: string;
  userId: string;
  lines: InvoiceLine[];
  totalCents: number;
  taxCents: number;
  createdAt: number;
}

// A "god function" that mixes pricing, tax, persistence-ish logic, formatting,
// email content generation, and logging. Several responsibilities in one place.
export function generateInvoice(user: User, items: InvoiceLine[]): Invoice {
  const id = "inv_" + Math.random().toString(36).slice(2, 10);
  let subtotal = 0;
  const lines: InvoiceLine[] = [];

  // Apply plan-specific pricing adjustments
  for (const item of items) {
    let amount = item.amountCents;
    if (user.plan === "pro") {
      amount = Math.round(amount * 0.95);
    } else if (user.plan === "team") {
      amount = Math.round(amount * 0.9);
    } else if (user.plan === "enterprise") {
      amount = Math.round(amount * 0.8);
    }
    lines.push({ description: item.description, amountCents: amount });
    subtotal += amount;
  }

  // Apply country-based tax (duplicated business rule — also lives in `tax()`)
  let taxRate = 0;
  if (user.country === "US") taxRate = 0;
  else if (user.country === "GB") taxRate = 0.2;
  else if (user.country === "DE") taxRate = 0.19;
  else if (user.country === "FR") taxRate = 0.2;
  else if (user.country === "AU") taxRate = 0.1;
  else taxRate = 0.15;

  const taxCents = Math.round(subtotal * taxRate);

  // Pretend persistence
  const invoice: Invoice = {
    id,
    userId: user.id,
    lines,
    totalCents: subtotal + taxCents,
    taxCents,
    createdAt: Date.now(),
  };

  // Compose email body inline (mixing concerns)
  let body = "Hi " + user.email + ",\n\n";
  body += "Thanks for your purchase. Invoice " + invoice.id + ":\n";
  for (const line of invoice.lines) {
    body += "  - " + line.description + ": $" + (line.amountCents / 100).toFixed(2) + "\n";
  }
  body += "Tax: $" + (invoice.taxCents / 100).toFixed(2) + "\n";
  body += "Total: $" + (invoice.totalCents / 100).toFixed(2) + "\n";
  body += "\nThanks for being a " + user.plan + " customer.\n";

  // TODO: extract email sending
  // FIXME: this should not log full PII in production
  console.log("[invoice] generated", invoice.id, "for", user.email, body.length, "bytes");

  // HACK: pretend retry loop
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      // imagine an HTTP call
      break;
    } catch {
      // XXX: swallowed error
    }
  }

  return invoice;
}

// Duplicated tax logic — same rules as inside generateInvoice
export function tax(country: string, subtotalCents: number): number {
  let rate = 0;
  if (country === "US") rate = 0;
  else if (country === "GB") rate = 0.2;
  else if (country === "DE") rate = 0.19;
  else if (country === "FR") rate = 0.2;
  else if (country === "AU") rate = 0.1;
  else rate = 0.15;
  return Math.round(subtotalCents * rate);
}

// A long, deeply-nested helper to inflate the file size
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
