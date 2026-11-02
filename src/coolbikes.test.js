import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { staticCatalog } from "./adapters/catalog/staticCatalog.js";
import { fakePayments } from "./adapters/payments/fakePayments.js";
import { createServer } from "./createServer.js";
import { paymentsPort, plug } from "./ports.js";

test("a payments plug without refund is refused", () => {
  assert.throws(
    () => plug("payments", paymentsPort, { async createSession() {} }),
    /refund/,
  );
});

test("the shop lists bikes from the catalog plug and checks out through the payments plug", async () => {
  const server = createServer({
    catalog: staticCatalog(),
    payments: fakePayments(),
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
    const body = await created.json();
    assert.equal(body.session.provider, "fake");
    assert.equal(body.session.amount.value, 89900);
    assert.equal(body.session.countryCode, "NL");
    assert.ok(body.session.id);
    assert.ok(body.session.sessionData);

    const refunded = await fetch(`${base}/api/refunds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPspReference: "PSP123" }),
    }).then((response) => response.json());
    assert.equal(refunded.refund.provider, "fake");
    assert.equal(refunded.refund.paymentPspReference, "PSP123");
  } finally {
    server.close();
    await once(server, "close");
  }
});
