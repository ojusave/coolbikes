// Result page. Success loads the invoice and, once Adyen has a pspReference,
// offers a refund of that exact amount. Other results only explain what happened.

const kind = location.pathname.split("/").pop();
const params = new URLSearchParams(location.search);
const reference = params.get("reference");
const copy = {
  success: ["Payment successful", "Your order has been placed and the payment is confirmed."],
  pending: ["Payment pending", "Your order has been received. The result is not final yet."],
  failed: ["Payment failed", "The payment was refused. Please try a different payment method or card."],
  error: ["Payment error", "An error occurred during payment. Please try again."],
};
const [title, message] = copy[kind] || copy.error;
document.querySelector("#status-card").dataset.kind = copy[kind] ? kind : "error";
document.querySelector("#title").textContent = title;
document.querySelector("#message").textContent = message;
document.title = `${title} · CoolBikesCo`;

function money(amount) {
  if (!amount || typeof amount.value !== "number") return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: amount.currency || "USD",
  }).format(amount.value / 100);
}

function showReference(value) {
  if (!value) return;
  document.querySelector("#details").hidden = false;
  document.querySelector("#reference").textContent = value;
}

function showRetry(value) {
  const productId = value?.split("-")[1];
  if (!productId || kind === "success") return;
  const again = document.querySelector("#again");
  again.hidden = false;
  again.href = `/checkout?product=${encodeURIComponent(productId)}`;
  again.textContent = kind === "failed" ? "Try a different payment" : "Try again";
}

function paintInvoice(order) {
  const invoice = document.querySelector("#invoice");
  invoice.hidden = false;
  document.querySelector("#invoice-bike").textContent = order.productName || "Bicycle";
  document.querySelector("#invoice-amount").textContent = money(order.amount) || "";
  document.querySelector("#invoice-method").textContent = order.paymentMethod || "Card";
  document.querySelector("#invoice-psp").textContent = order.pspReference || "Not available yet";
  const note = document.querySelector("#invoice-note");
  const button = document.querySelector("#refund");
  if (order.status === "REFUND_REQUESTED" || order.status === "REFUND") {
    document.querySelector("#title").textContent = "Refund requested";
    document.querySelector("#message").textContent =
      "Adyen accepted the refund. The final result arrives later, in a webhook, and in the Customer Area.";
    note.textContent = order.refundPspReference
      ? `Refund reference ${order.refundPspReference}. Status: received.`
      : "Adyen has not confirmed the refund yet.";
    button.hidden = true;
    document.title = "Refund requested · CoolBikesCo";
    return;
  }
  if (!order.canRefund) {
    note.textContent = "Payment is still being confirmed.";
    button.hidden = true;
    return;
  }
  note.textContent = "This returns the amount above. Adyen confirms the refund after this request.";
  button.hidden = false;
  button.disabled = false;
  button.textContent = money(order.amount) ? `Refund ${money(order.amount)}` : "Refund";
  button.onclick = () => requestRefund(order, button, note);
}

async function requestRefund(order, button, note) {
  button.disabled = true;
  button.textContent = "Requesting refund…";
  const response = await fetch("/api/refunds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference: order.reference }),
  });
  const body = await response.json();
  if (!response.ok) {
    note.textContent = body.error || "The refund could not be requested.";
    button.disabled = false;
    button.textContent = money(order.amount) ? `Refund ${money(order.amount)}` : "Refund";
    return;
  }
  const again = await fetch(`/api/orders/${encodeURIComponent(order.reference)}`);
  if (again.ok) {
    paintInvoice((await again.json()).order);
    return;
  }
  note.textContent = "Refund requested.";
  button.hidden = true;
}

async function loadInvoice() {
  const query = new URLSearchParams();
  const sessionId = params.get("sessionId");
  const sessionResult = params.get("sessionResult");
  if (sessionId) query.set("sessionId", sessionId);
  if (sessionResult) query.set("sessionResult", sessionResult);
  const response = await fetch(`/api/orders/${encodeURIComponent(reference)}?${query}`);
  if (!response.ok) {
    document.querySelector("#invoice-note") && (document.querySelector("#invoice").hidden = false);
    document.querySelector("#invoice-note").textContent = "This order could not be loaded.";
    return;
  }
  paintInvoice((await response.json()).order);
}

showReference(reference);
showRetry(reference);
if (kind === "success" && reference) {
  document.querySelector("#invoice").hidden = false;
  document.querySelector("#invoice-note").textContent = "Loading the invoice…";
  loadInvoice();
}
