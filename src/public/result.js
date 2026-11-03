const kind = location.pathname.split("/").pop();
const reference = new URLSearchParams(location.search).get("reference");
const copy = {
  success: ["Payment successful", "The order is placed and the payment is confirmed."],
  pending: ["Payment pending", "The order was received. The result is not final yet."],
  failed: ["Payment failed", "The payment was refused. Try a different card."],
  error: ["Payment error", "Checkout could not be completed."],
};
const [title, message] = copy[kind] || copy.error;
document.querySelector("#title").textContent = title;
document.querySelector("#message").textContent = message;
if (reference) document.querySelector("#reference").textContent = `Order reference: ${reference}`;
document.title = `${title} · CoolBikesCo`;
