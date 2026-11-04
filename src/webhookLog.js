// Webhooks Adyen has sent to this process. The list is wiped on restart.

import { randomUUID } from "node:crypto";

const received = [];

export function rememberWebhook(outcome, item, delivery = {}) {
  received.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    outcome,
    eventCode: item.eventCode || "unknown",
    success: item.success || "",
    pspReference: item.pspReference || "",
    merchantReference: item.merchantReference || "",
    merchantAccountCode: item.merchantAccountCode || "",
    paymentMethod: item.paymentMethod || "",
    amount: item.amount || null,
    reason: item.reason || "",
    request: delivery.request,
    response: delivery.response,
  });
  if (received.length > 100) received.pop();
}

export function listWebhooks() {
  return received;
}
