// GET or POST /handleShopperRedirect
// Adyen sends the shopper here after a redirect payment such as iDEAL or 3D Secure.

import { readBody, redirectTo } from "../http.js";
import { runTrace, span } from "../trace.js";

export async function handle({ request, response, url, checkout, books }) {
  if ((request.method !== "GET" && request.method !== "POST") || url.pathname !== "/handleShopperRedirect") {
    return false;
  }

  const redirect = request.method === "GET" ? Object.fromEntries(url.searchParams) : await readBody(request);
  const orderRef = redirect.orderRef || redirect.reference;
  if (!redirect.redirectResult && !redirect.payload) {
    redirectTo(response, `/result/error?reference=${encodeURIComponent(orderRef || "")}`);
    return true;
  }

  try {
    await runTrace({ id: orderRef || `redirect-${Date.now()}`, operation: "handleShopperRedirect" }, async () => {
      const result = await span("payments.submitRedirect", { reference: orderRef }, () =>
        checkout.submitRedirect({ redirectResult: redirect.redirectResult || redirect.payload }),
      );
      const reference = result.merchantReference || orderRef;
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
      redirectTo(
        response,
        `/result/${resultKind(result.resultCode)}?reference=${encodeURIComponent(reference || orderRef || "")}`,
      );
    });
  } catch {
    redirectTo(response, `/result/error?reference=${encodeURIComponent(orderRef || "")}`);
  }
  return true;
}

function resultKind(resultCode) {
  if (resultCode === "Authorised") return "success";
  if (resultCode === "Pending" || resultCode === "Received") return "pending";
  if (resultCode === "Refused" || resultCode === "Cancelled" || resultCode === "Error") return "failed";
  return "error";
}
