// Reloads the webhook list. Adyen calls this server, so the list only fills on the server Adyen can reach.

const root = document.querySelector("#hooks");
const empty = document.querySelector("#empty");
const live = document.querySelector("#live");

function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function money(amount) {
  if (!amount || typeof amount.value !== "number") return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: amount.currency || "EUR" }).format(amount.value / 100);
}

function render(item) {
  const card = document.createElement("article");
  card.className = "hook";
  card.dataset.outcome = item.outcome || "";
  const row = document.createElement("div");
  row.className = "row";
  const title = document.createElement("h2");
  title.textContent = item.eventCode;
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${item.outcome} · success ${item.success || "—"}`;
  row.append(title, meta);
  const when = document.createElement("p");
  when.className = "when";
  when.textContent = clock(item.at);
  const fields = document.createElement("p");
  fields.className = "fields";
  const parts = [
    item.merchantReference && `reference ${item.merchantReference}`,
    item.pspReference && `psp ${item.pspReference}`,
    item.paymentMethod,
    money(item.amount),
    item.reason,
  ].filter(Boolean);
  fields.textContent = parts.join(" · ");
  card.append(row, when, fields);
  return card;
}

async function load() {
  const response = await fetch("/api/webhooks");
  if (!response.ok) {
    live.textContent = "The webhook list could not be loaded.";
    return;
  }
  const body = await response.json();
  const items = body.webhooks || [];
  empty.hidden = items.length > 0;
  root.replaceChildren(...items.map(render));
  live.textContent = items.length === 1 ? "1 webhook" : `${items.length} webhooks`;
}

load();
setInterval(load, 2000);
