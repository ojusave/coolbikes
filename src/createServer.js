import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPort, paymentsPort, plug } from "./ports.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");

export function createServer({ catalog, payments }) {
  const products = plug("catalog", catalogPort, catalog);
  const checkout = plug("payments", paymentsPort, payments);

  return createHttpServer(async (request, response) => {
    try {
      await route(request, response, products, checkout);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

async function route(request, response, products, checkout) {
  const url = new URL(request.url, "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/") {
    const html = await readFile(join(publicDir, "index.html"));
    send(response, 200, html, "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/products") {
    sendJson(response, 200, { products: products.listProducts() });
    return;
  }

  const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (request.method === "GET" && productMatch) {
    const product = products.getProduct(decodeURIComponent(productMatch[1]));
    if (!product) {
      sendJson(response, 404, { error: "Unknown product" });
      return;
    }
    sendJson(response, 200, { product });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/checkout-sessions") {
    const body = await readJson(request);
    const product = products.getProduct(body.productId);
    if (!product) {
      sendJson(response, 404, { error: "Unknown product" });
      return;
    }
    const session = await checkout.createSession({
      amount: product.price,
      reference: `coolbikes-${product.id}-${Date.now()}`,
      countryCode: "NL",
      returnUrl: `${originOf(request)}/`,
      channel: "Web",
    });
    sendJson(response, 201, { product, session });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refunds") {
    const body = await readJson(request);
    if (!body.paymentPspReference) {
      sendJson(response, 400, { error: "paymentPspReference is required" });
      return;
    }
    const refund = await checkout.refund({
      paymentPspReference: body.paymentPspReference,
      amount: body.amount,
      reference: body.reference ?? `refund-${Date.now()}`,
    });
    sendJson(response, 201, { refund });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function originOf(request) {
  const host = request.headers.host ?? "127.0.0.1";
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = typeof forwarded === "string" ? forwarded : "http";
  return `${proto}://${host}`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Body must be JSON"));
      }
    });
    request.on("error", reject);
  });
}

function send(response, status, body, type) {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}
