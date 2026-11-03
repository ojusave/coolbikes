// POST /api/checkout-sessions
// Starts a checkout for one bike. The price comes from the catalog, not the browser.

import { originOf, readJson, sendJson } from "../http.js";
import { annotate, exchange, originalRequest, runTrace, span } from "../trace.js";

export async function handle({ request, response, url, products, checkout, books, shop }) {
  if (request.method !== "POST" || url.pathname !== "/api/checkout-sessions") return false;

  const { body, raw } = await readJson(request);
  const reference = `coolbikes-${body.productId}-${Date.now()}`;
  try {
    await runTrace({ id: reference, operation: "POST /api/checkout-sessions" }, async () => {
      exchange({ request: originalRequest(request.method, request.url, raw) });
      const product = await span("catalog.getProduct", { productId: body.productId }, async () => {
        const found = products.getProduct(body.productId);
        if (!found) {
          const error = new Error("Unknown product");
          error.statusCode = 404;
          throw error;
        }
        annotate({ amount: found.price });
        return found;
      });
      const returnUrl = `${originOf(request)}/handleShopperRedirect?orderRef=${encodeURIComponent(reference)}`;
      const session = await span(
        "payments.createSession",
        { reference, countryCode: shop.countryCode, amount: product.price },
        async () => {
          const created = await checkout.createSession({
            amount: product.price,
            reference,
            countryCode: shop.countryCode,
            returnUrl,
            channel: "Web",
            shopperLocale: shop.locale,
          });
          annotate({ provider: created.provider, sessionId: created.id });
          return created;
        },
      );
      await span("ledger.record", { reference, sessionId: session.id, status: "session_created" }, async () => {
        books.record({
          reference,
          productId: product.id,
          productName: product.name,
          amount: product.price,
          sessionId: session.id,
          provider: session.provider,
          status: "session_created",
          events: [{ type: "session_created", at: new Date().toISOString() }],
        });
      });
      const payload = { product, session: { ...session, locale: shop.locale } };
      annotate({ httpStatus: 201 });
      exchange({ response: payload });
      sendJson(response, 201, payload);
    });
  } catch (error) {
    if (error.statusCode === 404) {
      sendJson(response, 404, { error: "Unknown product" });
      return true;
    }
    throw error;
  }
  return true;
}
