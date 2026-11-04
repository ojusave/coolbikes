// POST /api/webhooks
// Adyen calls this itself. The reply must be the plain text [accepted].

import { readRaw, send, sendJson } from "../http.js";
import { annotate, exchange, runTrace, span } from "../trace.js";
import { listWebhooks, rememberWebhook } from "../webhookLog.js";

export async function handle({ request, response, url, checkout, books }) {
  if (url.pathname !== "/api/webhooks") return false;

  if (request.method === "GET") {
    sendJson(response, 200, { webhooks: listWebhooks() });
    return true;
  }

  if (request.method !== "POST") return false;

  const raw = await readRaw(request);
  let body;
  let parseError;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    parseError = new Error("Body must be JSON");
  }
  const notes = notifications(body);
  for (const item of notes) logWebhook("received", item);
  const reference = notes[0]?.merchantReference;
  const receivedRequest = {
    method: request.method,
    url: request.url,
    contentType: request.headers["content-type"] || "",
    body: raw,
  };

  // Use the same body strings for the wire, trace, and webhook details.
  // Do not rebuild the received JSON: whitespace and the whole envelope matter.
  const reply = (status, text, contentType, outcome) => {
    annotate({ httpStatus: status });
    exchange({ response: `HTTP ${status}\nContent-Type: ${contentType}\n\n${text}` });
    for (const item of notes.length ? notes : [{}]) {
      logWebhook(outcome, item);
      rememberWebhook(outcome, item, {
        request: receivedRequest,
        response: { statusCode: status, contentType, body: text },
      });
    }
    send(response, status, text, contentType);
  };

  try {
    await runTrace({ id: reference || `webhook-${Date.now()}`, operation: "POST /api/webhooks" }, async () => {
      exchange({ request: `${request.method} ${request.url}\nContent-Type: ${receivedRequest.contentType}\n\n${raw}` });
      try {
        if (parseError) throw parseError;
        const verified = await span("payments.verifyWebhook", {}, () => checkout.verifyWebhook(body));
        for (const item of verified.items) {
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
                events: [{
                  type: item.eventCode,
                  success: item.success,
                  pspReference: item.pspReference,
                  reason: item.reason,
                  at: new Date().toISOString(),
                }],
              });
            },
          );
        }
        reply(200, "[accepted]", "text/plain; charset=utf-8", "accepted");
      } catch (error) {
        const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
        const message = status === 400 || status === 401
          ? "Checkout could not be started."
          : "Something went wrong. Please try again.";
        reply(status, JSON.stringify({ error: message }), "application/json; charset=utf-8", "rejected");
        throw error; // Keep the trace marked as failed after sending the recorded response.
      }
    });
  } catch (error) {
    if (!response.headersSent) throw error;
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
  return (Array.isArray(body?.notificationItems) ? body.notificationItems : []).map((wrapper) => wrapper.NotificationRequestItem).filter(Boolean);
}
