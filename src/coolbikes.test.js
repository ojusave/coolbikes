// Checks the shop without calling Adyen: a broken plug is refused, and a
// stand-in payment can be authorised and then refunded once.

import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { staticCatalog } from "./adapters/catalog/staticCatalog.js";
import { memoryLedger } from "./adapters/ledger/memoryLedger.js";
import { fakePayments } from "./adapters/payments/fakePayments.js";
import { createServer } from "./createServer.js";
import { paymentsPort, plug } from "./ports.js";
import { listTraces } from "./trace.js";

test("a payments plug without refund is refused", () => {
  assert.throws(
    () =>
      plug("payments", paymentsPort, {
        async createSession() {},
        async submitRedirect() {},
        async verifyWebhook() {},
      }),
    /refund/,
  );
});

test("shop to refund works end to end on the fake payments plug", async () => {
  const server = createServer({
    catalog: staticCatalog(),
    payments: fakePayments(),
    ledger: memoryLedger(),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const listed = await fetch(`${base}/api/products`).then((response) => response.json());
    assert.deepEqual(
      listed.products.map((product) => product.id),
      ["city", "gravel", "cargo"],
    );

    const created = await fetch(`${base}/api/checkout-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "city" }),
    });
    assert.equal(created.status, 201);
    const sessionBody = await created.json();
    assert.equal(sessionBody.session.provider, "fake");
    assert.equal(sessionBody.session.amount.value, 89900);

    const pspReference = "fake_psp_from_webhook";
    const webhook = await fetch(`${base}/api/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notificationItems: [
          {
            NotificationRequestItem: {
              eventCode: "AUTHORISATION",
              success: "true",
              merchantReference: sessionBody.session.reference,
              pspReference,
              paymentMethod: "visa",
              amount: sessionBody.session.amount,
            },
          },
        ],
      }),
    });
    assert.equal(webhook.status, 200);
    assert.equal(await webhook.text(), "[accepted]");

    const payments = await fetch(`${base}/api/payments`).then((response) => response.json());
    assert.equal(payments.payments[0].status, "AUTHORISATION");
    assert.equal(payments.payments[0].pspReference, pspReference);

    const invoice = await fetch(
      `${base}/api/orders/${encodeURIComponent(sessionBody.session.reference)}`,
    ).then((response) => response.json());
    assert.equal(invoice.order.productName, "City Step-Through");
    assert.equal(invoice.order.pspReference, pspReference);
    assert.equal(invoice.order.canRefund, true);

    const refunded = await fetch(`${base}/api/refunds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentPspReference: pspReference,
        reference: sessionBody.session.reference,
        amount: sessionBody.session.amount,
      }),
    });
    assert.equal(refunded.status, 201);
    const refundBody = await refunded.json();
    assert.equal(refundBody.refund.provider, "fake");
    assert.equal(refundBody.refund.paymentPspReference, pspReference);

    const again = await fetch(`${base}/api/refunds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: sessionBody.session.reference }),
    });
    assert.equal(again.status, 409);
    const after = await fetch(
      `${base}/api/orders/${encodeURIComponent(sessionBody.session.reference)}`,
    ).then((response) => response.json());
    assert.equal(after.order.status, "REFUND_REQUESTED");
    assert.equal(after.order.canRefund, false);

    const traced = { traces: listTraces(sessionBody.session.reference) };
    const operations = traced.traces.flatMap((trace) => trace.spans.map((span) => span.operation));
    assert.ok(traced.traces[0].spans.every((span) => span.depth >= 1));
    assert.ok(operations.includes("catalog.getProduct"));
    assert.ok(operations.includes("payments.createSession"));
    assert.ok(operations.includes("payments.verifyWebhook"));
    assert.ok(operations.includes("payments.refund"));
    assert.ok(traced.traces[0].spans.every((span) => span.outcome === "ok"));
    assert.equal(operations.includes("POST /v72/sessions"), false);
    assert.equal(JSON.stringify(traced).includes("sessionData"), false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("webhook details preserve the full raw request and actual response, including failures", async () => {
  const standIn = fakePayments();
  const server = createServer({
    catalog: staticCatalog(),
    payments: {
      ...standIn,
      async verifyWebhook(body) {
        if (body.reject) {
          const error = new Error("Invalid signature (internal detail)");
          error.statusCode = 401;
          throw error;
        }
        return standIn.verifyWebhook(body);
      },
    },
    ledger: memoryLedger(),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const reference = "raw-webhook-test";
  const raw = '{\n  "live" : "false",\n  "notificationItems": [ { "NotificationRequestItem": { "eventCode":"AUTHORISATION", "merchantReference":"raw-webhook-test", "success":"true", "pspReference":"raw-psp", "additionalData":{"custom":"<b>literal</b>"} } } ]\n}\n';
  try {
    for (const [body, expectedStatus] of [[raw, 200], ['{ "reject": true }\n', 401], ['{ malformed JSON\n', 500]]) {
      const response = await fetch(`${base}/api/webhooks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const responseBody = await response.text();
      assert.equal(response.status, expectedStatus);
      const { webhooks } = await fetch(`${base}/api/webhooks`).then((r) => r.json());
      const recorded = webhooks[0];
      assert.equal(recorded.request.body, body);
      assert.equal(recorded.request.method, "POST");
      assert.equal(recorded.request.url, "/api/webhooks");
      assert.equal(recorded.response.body, responseBody);
      assert.equal(recorded.response.statusCode, response.status);
      assert.equal(recorded.response.contentType, response.headers.get("content-type"));
      assert.equal(recorded.outcome, expectedStatus === 200 ? "accepted" : "rejected");
      assert.ok(recorded.id);
      if (expectedStatus === 200) {
        assert.equal(responseBody, "[accepted]");
        const trace = listTraces(reference)[0];
        const call = trace.spans.find((s) => s.operation === "POST /api/webhooks");
        assert.ok(call.request.endsWith(`\n\n${raw}`));
        assert.ok(call.response.endsWith(`\n\n${responseBody}`));
      } else {
        assert.equal(responseBody.includes("internal detail"), false);
        const call = listTraces().flatMap((t) => t.spans).find((s) => s.operation === "POST /api/webhooks" && s.request?.endsWith(`\n\n${body}`));
        assert.equal(call.httpStatus, expectedStatus);
        assert.equal(call.outcome, "error");
        assert.ok(call.response.endsWith(`\n\n${responseBody}`));
      }
    }
  } finally {
    server.close();
    await once(server, "close");
  }
});
