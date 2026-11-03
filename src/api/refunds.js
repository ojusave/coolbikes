// POST /api/refunds
// Asks Adyen to refund one payment. The shopper starts this from the invoice.

import { readJson, sendJson } from "../http.js";
import { annotate, exchange, originalRequest, runTrace, span } from "../trace.js";

export async function handle({ request, response, url, checkout, books }) {
  if (request.method !== "POST" || url.pathname !== "/api/refunds") return false;

  const { body, raw } = await readJson(request);
  const payment =
    (body.reference && books.getByReference(body.reference)) ||
    books.list().find((entry) => entry.pspReference === body.paymentPspReference);

  const paymentPspReference = body.paymentPspReference || payment?.pspReference;
  if (!paymentPspReference) {
    sendJson(response, 400, { error: "paymentPspReference is required" });
    return true;
  }
  if (payment?.status === "REFUND_REQUESTED" || payment?.status === "REFUND") {
    sendJson(response, 409, { error: "This payment already has a refund request." });
    return true;
  }

  const amount = body.amount || payment?.amount;
  if (!amount) {
    sendJson(response, 400, { error: "amount is required for a refund" });
    return true;
  }

  const refundReference = body.reference ?? payment?.reference ?? `refund-${Date.now()}`;
  try {
    await runTrace({ id: refundReference, operation: "POST /api/refunds" }, async () => {
      exchange({ request: originalRequest(request.method, request.url, raw) });
      const refund = await span(
        "payments.refund",
        { paymentPspReference, amount, reference: refundReference },
        () =>
          checkout.refund({
            paymentPspReference,
            amount,
            reference: refundReference,
          }),
      );

      if (payment?.reference) {
        await span("ledger.record", { reference: payment.reference, status: "REFUND_REQUESTED" }, async () => {
          books.record({
            reference: payment.reference,
            status: "REFUND_REQUESTED",
            refundPspReference: refund.pspReference,
            events: [
              {
                type: "REFUND_REQUESTED",
                pspReference: refund.pspReference,
                at: new Date().toISOString(),
              },
            ],
          });
        });
      }

      annotate({ httpStatus: 201 });
      exchange({ response: { refund } });
      sendJson(response, 201, { refund });
    });
  } catch (error) {
    console.error("Refund failed:", error.message);
    if (!response.headersSent) {
      const detail = String(error.message || "");
      const safe = detail && !/api.?key/i.test(detail) ? detail.slice(0, 180) : "The refund could not be requested.";
      sendJson(response, Number.isInteger(error.statusCode) ? error.statusCode : 502, { error: safe });
    }
  }
  return true;
}
