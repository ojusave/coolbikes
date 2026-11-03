// Stand-in for Adyen. Same ports as the Adyen plug so the shop
// can run end-to-end before a test account is ready.

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}_${sequence}`;
}

export function fakePayments() {
  return {
    name: "fake",
    async createSession(request) {
      return {
        provider: "fake",
        id: nextId("fake_session"),
        sessionData: nextId("fake_session_data"),
        clientKey: null,
        environment: "test",
        amount: request.amount,
        countryCode: request.countryCode,
        reference: request.reference,
        returnUrl: request.returnUrl,
        channel: request.channel,
      };
    },
    async refund(request) {
      return {
        provider: "fake",
        status: "received",
        pspReference: nextId("fake_refund"),
        paymentPspReference: request.paymentPspReference,
        amount: request.amount ?? null,
        reference: request.reference,
      };
    },
    async submitRedirect() {
      return {
        provider: "fake",
        resultCode: "Authorised",
        pspReference: nextId("fake_psp"),
      };
    },
    async verifyWebhook(body) {
      const items = body?.notificationItems ?? [];
      return {
        provider: "fake",
        ok: true,
        items: items.map((item) => item.NotificationRequestItem).filter(Boolean),
      };
    },
    // Demo path: the fake Drop-in calls this so the ledger gets a
    // pspReference without talking to Adyen.
    async completeDemo(request) {
      return {
        provider: "fake",
        resultCode: "Authorised",
        pspReference: nextId("fake_psp"),
        reference: request.reference,
        amount: request.amount,
        paymentMethod: request.paymentMethod ?? "scheme",
      };
    },
  };
}
