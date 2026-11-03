const params = new URLSearchParams(location.search);
const productId = params.get("product");
const statusBox = document.querySelector("#status");

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency || "EUR",
  }).format(price.value / 100);
}

function setStatus(text) {
  statusBox.textContent = text;
}

async function loadScript(src) {
  if (window.CoolBikesAdyenCheckout) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Checkout widget failed to load."));
    document.head.append(script);
  });
}

async function start() {
  if (!productId) {
    location.href = "/";
    return;
  }
  const response = await fetch("/api/checkout-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const body = await response.json();
  if (!response.ok) {
    setStatus(body.error || "Checkout could not be started.");
    return;
  }
  const price = formatPrice(body.product.price);
  document.querySelector("#item-name").textContent = body.product.name;
  document.querySelector("#item-price").textContent = price;
  document.querySelector("#total-amount").textContent = price;
  document.title = `${body.product.name} · CoolBikesCo`;
  if (body.session.provider !== "adyen") {
    setStatus("This payments plug has no card form.");
    return;
  }
  await loadScript("/checkout-adyen.js");
  await window.CoolBikesAdyenCheckout.mount(body.session, document.querySelector("#dropin-container"), { setStatus });
}

start().catch(() => setStatus("The card form could not be shown."));
