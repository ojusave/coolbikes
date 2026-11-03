const list = document.querySelector("#products");

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency || "EUR",
  }).format(price.value / 100);
}

async function loadProducts() {
  const response = await fetch("/api/products");
  const body = await response.json();
  if (!response.ok) {
    list.textContent = "The bikes could not be loaded.";
    return;
  }
  list.replaceChildren();
  for (const product of body.products) {
    const card = document.createElement("a");
    card.className = "integration-card";
    card.href = `/checkout?product=${encodeURIComponent(product.id)}`;
    const content = document.createElement("div");
    content.className = "card-content";
    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = product.name;
    const price = document.createElement("div");
    price.className = "card-price";
    price.textContent = formatPrice(product.price);
    const summary = document.createElement("p");
    summary.className = "card-description";
    summary.textContent = product.summary;
    content.append(title, price, summary);
    card.append(content);
    list.append(card);
  }
}

loadProducts();
