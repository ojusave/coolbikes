// GET /api/config
// Tells the page which payments plug is on, and the shop's country and currency.

import { sendJson } from "../http.js";

export async function handle({ request, response, url, checkout, shop }) {
  if (request.method !== "GET" || url.pathname !== "/api/config") return false;
  sendJson(response, 200, {
    payments: checkout.name,
    countryCode: shop.countryCode,
    currency: shop.currency,
    locale: shop.locale,
  });
  return true;
}
