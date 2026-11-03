import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPort, ledgerPort, paymentsPort, plug } from "./ports.js";
import { annotate, listTraces, runTrace, span, subscribe } from "./trace.js";

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

  if (request.method === "GET" && url.pathname === "/trace") {
    await sendFile(response, "trace.html", "text/html; charset=utf-8");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/traces/stream") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const write = (message) => response.write(`data: ${message}\n\n`);
    write(JSON.stringify({ type: "snapshot", traces: listTraces() }));
    const unsubscribe = subscribe(write);
    const beat = setInterval(() => response.write(": keepalive\n\n"), 15000);
    request.on("close", () => {
      clearInterval(beat);
      unsubscribe();
    });
    return;
  }

  const staticFile = {
    "/shop.css": ["shop.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/checkout.js": ["checkout.js", "text/javascript; charset=utf-8"],
    "/checkout-adyen.js": ["checkout-adyen.js", "text/javascript; charset=utf-8"],
    "/trace.js": ["trace.js", "text/javascript; charset=utf-8"],
    "/result.js": ["result.js", "text/javascript; charset=utf-8"],
  }[url.pathname];
  if (request.method === "GET" && staticFile) {
    await sendFile(response, staticFile[0], staticFile[1]);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, {
      payments: checkout.name,
      countryCode: shop.countryCode,
      currency: shop.currency,
      locale: shop.locale,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/products") {
    const listed = products.listProducts();
    sendJson(response, 200, { products: listed });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/traces") {
    sendJson(response, 200, { traces: listTraces(url.searchParams.get("reference")) });
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
    const reference = `coolbikes-${body.productId}-${Date.now()}`;
    try {
      await runTrace({ id: reference, operation: "POST /api/checkout-sessions" }, async () => {
        const product = await span("catalog.getProduct", { productId: body.productId }, async () => {
          const found = products.getProduct(body.productId);
          if (!found) {
            const error = new Error("Unknown product");
            error.statusCode = 404;
            throw error;
          }
          annotate({ amount: found.price });
          return found;
        });
        const returnUrl = `${originOf(request)}/?redirect=1&reference=${encodeURIComponent(reference)}`;
        const session = await span(
          "payments.createSession",
          { reference, countryCode: shop.countryCode, amount: product.price },
          async () => {
            const created = await checkout.createSession({
              amount: product.price,
              reference,
              countryCode: shop.countryCode,
              returnUrl,
              channel: "Web",
              shopperLocale: shop.locale,
            });
            annotate({ provider: created.provider, sessionId: created.id });
            return created;
          },
        );
        await span("ledger.record", { reference, sessionId: session.id, status: "session_created" }, async () => {
          books.record({
            reference,
            productId: product.id,
            productName: product.name,
            amount: product.price,
            sessionId: session.id,
            provider: session.provider,
            status: "session_created",
            events: [{ type: "session_created", at: new Date().toISOString() }],
          });
        });
        sendJson(response, 201, {
          product,
          session: { ...session, locale: shop.locale },
        });
      });
    } catch (error) {
      if (error.statusCode === 404) {
        sendJson(response, 404, { error: "Unknown product" });
        return;
      }
      throw error;
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/redirect") {
    const body = await readJson(request);
    if (!body.redirectResult) {
      sendJson(response, 400, { error: "redirectResult is required" });
      return;
    }
    await runTrace({ id: body.reference || `redirect-${Date.now()}`, operation: "POST /api/redirect" }, async () => {
      const result = await span("payments.submitRedirect", {}, () =>
        checkout.submitRedirect({ redirectResult: body.redirectResult }),
      );
      const reference = result.merchantReference || body.reference;
      if (reference) {
        await span(
          "ledger.record",
          { reference, resultCode: result.resultCode, pspReference: result.pspReference },
          async () => {
            books.record({
              reference,
              status: result.resultCode,
              pspReference: result.pspReference,
              events: [
                {
                  type: "redirect_result",
                  resultCode: result.resultCode,
                  pspReference: result.pspReference,
                  at: new Date().toISOString(),
                },
              ],
            });
          },
        );
      }
      sendJson(response, 200, { result });
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/webhooks") {
    const body = await readJson(request);
    const reference = body?.notificationItems?.[0]?.NotificationRequestItem?.merchantReference;
    await runTrace({ id: reference || `webhook-${Date.now()}`, operation: "POST /api/webhooks" }, async () => {
      const verified = await span("payments.verifyWebhook", {}, () => checkout.verifyWebhook(body));
      for (const item of verified.items) {
        await span(
          "ledger.record",
          {
            reference: item.merchantReference,
            eventCode: item.eventCode,
            pspReference: item.pspReference,
            success: item.success,
          },
          async () => {
            books.record({
              reference: item.merchantReference,
              status: item.eventCode,
              pspReference: item.pspReference,
              success: item.success,
              paymentMethod: item.paymentMethod,
              amount: item.amount,
              events: [
                {
                  type: item.eventCode,
                  success: item.success,
                  pspReference: item.pspReference,
                  reason: item.reason,
                  at: new Date().toISOString(),
                },
              ],
            });
          },
        );
      }
      // Adyen expects [accepted] as plain text for standard webhooks.
      send(response, 200, "[accepted]", "text/plain; charset=utf-8");
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/payments") {
    sendJson(response, 200, { payments: books.list() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refunds") {
    const body = await readJson(request);
    const payment =
      (body.reference && books.getByReference(body.reference)) ||
      books.list().find((entry) => entry.pspReference === body.paymentPspReference);

    const paymentPspReference = body.paymentPspReference || payment?.pspReference;
    if (!paymentPspReference) {
      sendJson(response, 400, { error: "paymentPspReference is required" });
      return;
    }

    const amount = body.amount || payment?.amount;
    if (!amount) {
      sendJson(response, 400, { error: "amount is required for a refund" });
      return;
    }

    const refundReference = body.reference ?? payment?.reference ?? `refund-${Date.now()}`;
    await runTrace({ id: refundReference, operation: "POST /api/refunds" }, async () => {
      const refund = await span(
        "payments.refund",
        { paymentPspReference, amount, reference: refundReference },
        () =>
          checkout.refund({
            paymentPspReference,
            amount,
            reference: refundReference,
          }),
      );

      if (payment?.reference) {
        await span("ledger.record", { reference: payment.reference, status: "REFUND_REQUESTED" }, async () => {
          books.record({
            reference: payment.reference,
            status: "REFUND_REQUESTED",
            events: [
              {
                type: "REFUND_REQUESTED",
                pspReference: refund.pspReference,
                at: new Date().toISOString(),
              },
            ],
          });
        });
      }

      sendJson(response, 201, { refund });
    });
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

function shopperMessage(status) {
  if (status === 400 || status === 401) return "Checkout could not be started.";
  return "Something went wrong. Please try again.";
}

async function sendFile(response, name, type) {
  const body = await readFile(join(publicDir, name));
  send(response, 200, body, type);
}

function send(response, status, body, type) {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}
