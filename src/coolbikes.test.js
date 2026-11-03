import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { staticCatalog } from "./adapters/catalog/staticCatalog.js";
import { memoryLedger } from "./adapters/ledger/memoryLedger.js";
import { fakePayments } from "./adapters/payments/fakePayments.js";
import { createServer } from "./createServer.js";
import { paymentsPort, plug } from "./ports.js";

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

    const traced = await fetch(
      `${base}/api/traces?reference=${encodeURIComponent(sessionBody.session.reference)}`,
    ).then((response) => response.json());
    const operations = traced.traces.flatMap((trace) => trace.spans.map((span) => span.operation));
    assert.ok(traced.traces[0].spans.every((span) => span.depth >= 1));
    assert.ok(operations.includes("catalog.getProduct"));
    assert.ok(operations.includes("payments.createSession"));
    assert.ok(operations.includes("payments.verifyWebhook"));
    assert.ok(operations.includes("payments.refund"));
    assert.ok(traced.traces[0].spans.every((span) => span.outcome === "ok"));
    assert.equal(operations.includes("POST /v72/sessions"), false);
    assert.equal(JSON.stringify(traced).includes("sessionData"), false);

    const tracePage = await fetch(`${base}/trace`);
    assert.equal(tracePage.status, 200);
    assert.match(await tracePage.text(), /Operations/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
