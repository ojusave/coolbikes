// POST /api/webhooks
// Adyen calls this itself. The reply must be the plain text [accepted].

import { readJson, send, sendJson } from "../http.js";
import { annotate, exchange, originalRequest, runTrace, span } from "../trace.js";
import { listWebhooks, rememberWebhook } from "../webhookLog.js";

export async function handle({ request, response, url, checkout, books }) {
  if (url.pathname !== "/api/webhooks") return false;

  if (request.method === "GET") {
    sendJson(response, 200, { webhooks: listWebhooks() });
    return true;
  }

  if (request.method !== "POST") return false;

  const { body, raw } = await readJson(request);
  const notes = notifications(body);
  for (const item of notes) logWebhook("received", item);
  const reference = notes[0]?.merchantReference;
  try {
    await runTrace({ id: reference || `webhook-${Date.now()}`, operation: "POST /api/webhooks" }, async () => {
      exchange({ request: originalRequest(request.method, request.url, raw) });
      const verified = await span("payments.verifyWebhook", {}, () => checkout.verifyWebhook(body));
      for (const item of verified.items) {
        logWebhook("accepted", item);
        rememberWebhook("accepted", item);
        await span(
          "ledger.record",
          {
            reference: item.merchantReference,
            eventCode: item.eventCode,
            pspReference: item.pspReference,
            success: item.success,
          },
          async () => {
            books.record({
              reference: item.merchantReference,
              status: item.eventCode,
              pspReference: item.pspReference,
              success: item.success,
              paymentMethod: item.paymentMethod,
              amount: item.amount,
              events: [
                {
                  type: item.eventCode,
                  success: item.success,
                  pspReference: item.pspReference,
                  reason: item.reason,
                  at: new Date().toISOString(),
                },
              ],
            });
          },
        );
      }
      annotate({ httpStatus: 200 });
      exchange({ response: "[accepted]" });
      send(response, 200, "[accepted]", "text/plain; charset=utf-8");
    });
  } catch (error) {
    for (const item of notes) {
      logWebhook("rejected", item);
      rememberWebhook("rejected", item);
    }
    throw error;
  }
  return true;
}

// One line per notification, so the terminal shows the event without the whole body.
function logWebhook(outcome, item) {
  console.log(
    `webhook ${outcome} ${item.eventCode || "unknown"} success=${item.success || ""} psp=${item.pspReference || ""} reference=${item.merchantReference || ""}`,
  );
}

function notifications(body) {
  return (body?.notificationItems ?? []).map((wrapper) => wrapper.NotificationRequestItem).filter(Boolean);
}
