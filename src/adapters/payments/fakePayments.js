// Stand-in for Adyen. Returns the same session fields Drop-in will read:
// id, sessionData, clientKey, environment.
// Pull this file out of src/index.js and plug in the Adyen adapter.

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
  };
}
