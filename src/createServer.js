// The shop's HTTP server.
// Pages stay here. Each JSON route lives in src/api, one file per call.
// The payments plug does the Adyen work.

import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apis } from "./api/index.js";
import { send, sendJson } from "./http.js";
import { catalogPort, ledgerPort, paymentsPort, plug } from "./ports.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
const defaultShop = { countryCode: "NL", locale: "en-US", currency: "EUR" };

export function createServer({ catalog, payments, ledger, shop = defaultShop }) {
  const products = plug("catalog", catalogPort, catalog);
  const checkout = plug("payments", paymentsPort, payments);
  const books = plug("ledger", ledgerPort, ledger);

  return createHttpServer(async (request, response) => {
    try {
      await route(request, response, products, checkout, books, shop);
    } catch (error) {
      const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (!error.traced) console.error(error);
      sendJson(response, status, { error: shopperMessage(status) });
    }
  });
}

async function route(request, response, products, checkout, books, shop) {
  const url = new URL(request.url, "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/") {
    await sendFile(response, "index.html", "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && url.pathname === "/checkout") {
    await sendFile(response, "checkout.html", "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/result/")) {
    await sendFile(response, "result.html", "text/html; charset=utf-8");
    return;
  }

  // Same stream the shop pages listen to. This page is the full-width view.
  if (request.method === "GET" && url.pathname === "/traces") {
    await sendFile(response, "traces.html", "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && url.pathname === "/webhooks") {
    await sendFile(response, "webhooks.html", "text/html; charset=utf-8");
    return;
  }

  const staticFile = {
    "/shop.css": ["shop.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/checkout.js": ["checkout.js", "text/javascript; charset=utf-8"],
    "/checkout-adyen.js": ["checkout-adyen.js", "text/javascript; charset=utf-8"],
    "/result.js": ["result.js", "text/javascript; charset=utf-8"],
    "/traces.js": ["traces.js", "text/javascript; charset=utf-8"],
    "/webhooks.js": ["webhooks.js", "text/javascript; charset=utf-8"],
    "/bikes/city.jpg": ["bikes/city.jpg", "image/jpeg"],
    "/bikes/gravel.jpg": ["bikes/gravel.jpg", "image/jpeg"],
    "/bikes/cargo.jpg": ["bikes/cargo.jpg", "image/jpeg"],
  }[url.pathname];
  if (request.method === "GET" && staticFile) {
    await sendFile(response, staticFile[0], staticFile[1]);
    return;
  }

  const context = { request, response, url, products, checkout, books, shop };
  for (const handle of apis) {
    if (await handle(context)) return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function shopperMessage(status) {
  if (status === 400 || status === 401) return "Checkout could not be started.";
  return "Something went wrong. Please try again.";
}

async function sendFile(response, name, type) {
  const body = await readFile(join(publicDir, name));
  send(response, 200, body, type);
}
