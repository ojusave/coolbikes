// Checkout page. Shows the bike and total first, then asks the server to
// open an Adyen session and mounts Drop-in in the payment box.

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
  // Wait until the trace stream is open, so this session is seen as it happens.
  if (window.coolbikesTracesReady) await window.coolbikesTracesReady;
  const listed = await fetch(`/api/products/${encodeURIComponent(productId)}`);
  const listedBody = await listed.json();
  if (!listed.ok) {
    setStatus(listedBody.error || "That bike is not in the shop.");
    return;
  }
  const product = listedBody.product;
  const price = formatPrice(product.price);
  document.querySelector("#item-name").textContent = product.name;
  document.querySelector("#item-price").textContent = price;
  document.querySelector("#total-amount").textContent = price;
  const photo = document.querySelector("#item-photo");
  if (product.image) {
    photo.src = product.image;
    photo.alt = product.name;
    photo.hidden = false;
  }
  document.title = `${product.name} · CoolBikesCo`;
  setStatus("Loading payment methods…");
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
  if (body.session.provider !== "adyen") {
    setStatus("This payments plug has no card form.");
    return;
  }
  await loadScript("/checkout-adyen.js");
  await window.CoolBikesAdyenCheckout.mount(body.session, document.querySelector("#dropin-container"), { setStatus });
  setStatus("");
}

start().catch(() => setStatus("The card form could not be shown."));
