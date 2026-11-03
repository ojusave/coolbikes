// Stand-in for Adyen. It has the same jobs as the real plug, so tests can
// run the whole shop without a network call or a test account.

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
  };
}
