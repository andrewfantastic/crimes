// Intentionally bad: boolean-naming and plural-mismatch demonstrations.
// This file is fixture material — do not import it from real code.

interface User {
  id: string;
  email: string;
}

interface Invoice {
  id: string;
  totalCents: number;
}

// boolean_naming_drift: type-annotated boolean with no `is`/`has`/etc.
export const paid: boolean = false;

// boolean_naming_drift: boolean from a comparison, name reads as a noun.
export const expired = Date.now() > 0;

// boolean_naming_drift: negation initializer.
export const stale = !paid;

// singular_plural_type_mismatch: plural name, singular type.
export const users: User = { id: "u_1", email: "a@b.c" };

// singular_plural_type_mismatch: singular name, array type.
export const invoice: Invoice[] = [];

// Negative controls — should NOT fire:
export const isReady: boolean = true;
export const loading: boolean = false;
export const FEATURE_X_ENABLED: boolean = true;
export const user: User = { id: "u_2", email: "x@y.z" };
export const invoices: Invoice[] = [];
