// A port is the list of jobs a plug must be able to do.
// plug() checks that list once, when the app starts, so a half-built plug fails immediately.

export const catalogPort = ["listProducts", "getProduct"];

// Same shape the Adyen /sessions flow needs, so that adapter can
// replace the fake one without the shop knowing.
export const paymentsPort = ["createSession", "refund", "submitRedirect", "verifyWebhook"];

// Remembers payments the shop has seen, so refunds and the
// Customer Area walkthrough have a pspReference to use.
export const ledgerPort = ["record", "list", "getByReference"];

export function plug(name, methods, adapter) {
  const missing = methods.filter((method) => typeof adapter?.[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`${name} plug is missing: ${missing.join(", ")}`);
  }
  return adapter;
}
