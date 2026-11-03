// GET /api/products and GET /api/products/:id
// The bike list, and one bike when the shopper opens checkout.

import { sendJson } from "../http.js";

export async function handle({ request, response, url, products }) {
  if (request.method !== "GET") return false;

  if (url.pathname === "/api/products") {
    sendJson(response, 200, { products: products.listProducts() });
    return true;
  }

  const match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (!match) return false;

  const product = products.getProduct(decodeURIComponent(match[1]));
  if (!product) {
    sendJson(response, 404, { error: "Unknown product" });
    return true;
  }
  sendJson(response, 200, { product });
  return true;
}
