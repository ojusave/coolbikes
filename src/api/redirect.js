// POST /api/redirect
// Same job as the shopper redirect, but the caller wants JSON instead of a new page.

import { readJson, sendJson } from "../http.js";
import { annotate, exchange, originalRequest, runTrace, span } from "../trace.js";

export async function handle({ request, response, url, checkout, books }) {
  if (request.method !== "POST" || url.pathname !== "/api/redirect") return false;

  const { body, raw } = await readJson(request);
  if (!body.redirectResult) {
    sendJson(response, 400, { error: "redirectResult is required" });
    return true;
  }

  await runTrace({ id: body.reference || `redirect-${Date.now()}`, operation: "POST /api/redirect" }, async () => {
    exchange({ request: originalRequest(request.method, request.url, raw) });
    const result = await span("payments.submitRedirect", {}, () =>
      checkout.submitRedirect({ redirectResult: body.redirectResult }),
    );
    const reference = result.merchantReference || body.reference;
    if (reference) {
      await span(
        "ledger.record",
        { reference, resultCode: result.resultCode, pspReference: result.pspReference },
        async () => {
          books.record({
            reference,
            status: result.resultCode,
            pspReference: result.pspReference,
            events: [
              {
                type: "redirect_result",
                resultCode: result.resultCode,
                pspReference: result.pspReference,
                at: new Date().toISOString(),
              },
            ],
          });
        },
      );
    }
    annotate({ httpStatus: 200 });
    exchange({ response: { result } });
    sendJson(response, 200, { result });
  });
  return true;
}
