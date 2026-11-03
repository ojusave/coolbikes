// GET /api/orders/:reference
// The invoice. If Adyen sent a session result, this also asks Adyen how the payment ended.

import { sendJson } from "../http.js";
import { span } from "../trace.js";

export async function handle({ request, response, url, checkout, books }) {
  const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (request.method !== "GET" || !match) return false;

  const reference = decodeURIComponent(match[1]);
  let order = books.getByReference(reference);
  if (!order) {
    sendJson(response, 404, { error: "Unknown order" });
    return true;
  }

  const sessionId = url.searchParams.get("sessionId");
  const sessionResult = url.searchParams.get("sessionResult");
  if (sessionId && sessionResult && !order.pspReference && typeof checkout.getSessionResult === "function") {
    try {
      const resolved = await span("payments.getSessionResult", { sessionId, reference }, () =>
        checkout.getSessionResult({ sessionId, sessionResult }),
      );
      order = books.record({
        reference,
        status: resolved.resultCode || order.status,
        pspReference: resolved.pspReference || order.pspReference,
        paymentMethod: resolved.paymentMethod || order.paymentMethod,
        amount: resolved.amount || order.amount,
        sessionId,
      });
    } catch (error) {
      console.error("Session result lookup failed:", error.message);
    }
  }

  sendJson(response, 200, { order: invoiceOf(order) });
  return true;
}

function invoiceOf(order) {
  const closed = order.status === "REFUND_REQUESTED" || order.status === "REFUND";
  return {
    reference: order.reference,
    productName: order.productName ?? null,
    amount: order.amount ?? null,
    status: order.status ?? null,
    pspReference: order.pspReference ?? null,
    paymentMethod: order.paymentMethod ?? null,
    refundPspReference: order.refundPspReference ?? null,
    canRefund: Boolean(order.pspReference) && !closed && order.success !== "false",
  };
}
