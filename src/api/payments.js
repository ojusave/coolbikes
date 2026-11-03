// GET /api/payments
// Every payment this shop process still remembers.

import { sendJson } from "../http.js";

export async function handle({ request, response, url, books }) {
  if (request.method !== "GET" || url.pathname !== "/api/payments") return false;
  sendJson(response, 200, { payments: books.list() });
  return true;
}
