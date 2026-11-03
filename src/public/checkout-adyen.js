const SDK = "6.6.0";
const BASE = `https://checkoutshopper-test.cdn.adyen.com/checkoutshopper/sdk/${SDK}`;

function once(tag, key, build) {
  const existing = document.querySelector(`${tag}[${key}]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const node = build();
    node.onload = () => resolve();
    node.onerror = () => reject(new Error("Adyen checkout assets failed to load."));
    document.head.append(node);
  });
}

async function ensureSdk() {
  if (!document.querySelector(`link[href="${BASE}/adyen.css"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${BASE}/adyen.css`;
    link.integrity = "sha384-UAD/QSv1wQyfA60svLYxJ0OJAPl9TpkksO+HEOUX8YJcD+MYzNmn+q4XL7YBeHcr";
    link.crossOrigin = "anonymous";
    document.head.append(link);
  }
  await once("script", `src="${BASE}/adyen.js"`, () => {
    const script = document.createElement("script");
    script.src = `${BASE}/adyen.js`;
    script.integrity = "sha384-Oa2agnE48SFtDpzmEK8mbhbmEA1X4WH6afLBbypUhFU8oDhJWAIGvLQTBrqgls4A";
    script.crossOrigin = "anonymous";
    return script;
  });
}

window.CoolBikesAdyenCheckout = {
  async mount(session, element, { setStatus }) {
    await ensureSdk();
    const { AdyenCheckout, Dropin } = window.AdyenWeb;
    const checkoutUi = await AdyenCheckout({
      session: { id: session.id, sessionData: session.sessionData },
      clientKey: session.clientKey,
      environment: session.environment || "test",
      locale: session.locale || "en-US",
      countryCode: session.countryCode,
      amount: session.amount,
      showPayButton: true,
      onPaymentCompleted(result) {
        setStatus("ok", result.resultCode === "Authorised" ? "Payment received." : `Payment ${result.resultCode}.`);
      },
      onPaymentFailed() {
        setStatus("error", "The payment was not completed. You can try again.");
      },
      onError(error) {
        console.error("Drop-in error", error);
        setStatus("error", "The card form could not be shown.");
      },
    });
    return new Dropin(checkoutUi, {
      paymentMethodsConfiguration: {
        card: {
          hasHolderName: true,
          holderNameRequired: true,
          amount: session.amount,
        },
      },
    }).mount(element);
  },
};
