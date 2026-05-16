interface CheckoutOptions {
  plan: string;
  role: string;
  region: string;
  currency: string;
  status: string;
  retry: boolean;
}

export function describeCheckout(options: CheckoutOptions) {
  return [
    options.plan,
    options.role,
    options.region,
    options.currency,
    options.status,
    String(options.retry),
  ].join(":");
}

export function resolvePaymentResult(input: {
  error?: boolean;
  redirect?: boolean;
  code?: string;
  message?: string;
  url?: string;
  value?: string;
}) {
  if (input.error) return { ok: false, code: input.code, message: input.message };
  if (input.redirect) return { url: input.url, permanent: false };
  return { ok: true, value: input.value, cached: false };
}

export function canRunBilling(disableBilling: boolean, skipRetry: boolean) {
  if (!disableBilling && !skipRetry) return true;
  return false;
}
