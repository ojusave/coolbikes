const list = document.querySelector("#products");
const pay = document.querySelector("#pay");
const checkout = document.querySelector("#checkout");
const dropinRoot = document.querySelector("#dropin");
const statusBox = document.querySelector("#status");
let shop = { locale: "en-US", currency: "EUR" };
let selected = null;
let activeDropin = null;

function formatPrice(price) {
  return new Intl.NumberFormat(shop.locale, {
    style: "currency",
    currency: price.currency || shop.currency,
  }).format(price.value / 100);
}

function setStatus(kind, text) {
  statusBox.dataset.kind = kind;
  statusBox.textContent = text;
}

function clearDropin() {
  if (activeDropin?.unmount) activeDropin.unmount();
  activeDropin = null;
  dropinRoot.replaceChildren();
}

async function loadProducts() {
  const response = await fetch("/api/products");
  const body = await response.json();
  if (!response.ok) {
    setStatus("error", "The bikes could not be loaded.");
    return;
  }
  list.replaceChildren();
  for (const product of body.products) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bike";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="name"></span><span class="price"></span><span class="summary"></span>`;
    button.querySelector(".name").textContent = product.name;
    button.querySelector(".price").textContent = formatPrice(product.price);
    button.querySelector(".summary").textContent = product.summary;
    button.addEventListener("click", () => {
      selected = product;
      pay.disabled = false;
      pay.textContent = `Pay ${formatPrice(product.price)}`;
      for (const other of list.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
    item.append(button);
    list.append(item);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.CoolBikesAdyenCheckout) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Checkout widget failed to load."));
    document.head.append(script);
  });
}

async function mountCheckout(session) {
  clearDropin();
  if (session.provider !== "adyen") {
    setStatus("error", "This payments plug has no card form.");
    return;
  }
  await loadScript("/checkout-adyen.js");
  activeDropin = await window.CoolBikesAdyenCheckout.mount(session, dropinRoot, { setStatus });
}

async function startCheckout() {
  if (!selected) return;
  pay.disabled = true;
  checkout.hidden = false;
  clearDropin();
  setStatus("", "Starting checkout…");
  const response = await fetch("/api/checkout-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId: selected.id }),
  });
  const body = await response.json();
  if (!response.ok) {
    setStatus("error", body.error || "Checkout could not be started.");
    pay.disabled = false;
    return;
  }
  setStatus("", "");
  try {
    await mountCheckout(body.session);
  } catch {
    setStatus("error", "The card form could not be shown.");
  }
  pay.disabled = false;
}

pay.addEventListener("click", startCheckout);

fetch("/api/config")
  .then((response) => (response.ok ? response.json() : shop))
  .then((config) => {
    shop = config;
  })
  .finally(loadProducts);
