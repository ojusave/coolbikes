// Webhooks Adyen has sent to this process. The list is wiped on restart.

const received = [];

export function rememberWebhook(outcome, item) {
  received.unshift({
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
  });
  if (received.length > 100) received.pop();
}

export function listWebhooks() {
  return received;
}
