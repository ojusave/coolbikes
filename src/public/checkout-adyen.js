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

function resultPath(resultCode, reference) {
  const query = reference ? `?reference=${encodeURIComponent(reference)}` : "";
  if (resultCode === "Authorised") return `/result/success${query}`;
  if (resultCode === "Pending" || resultCode === "Received") return `/result/pending${query}`;
  if (resultCode === "Cancelled" || resultCode === "Refused") return `/result/failed${query}`;
  return `/result/error${query}`;
}

window.CoolBikesAdyenCheckout = {
  async mount(session, element) {
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
        location.href = resultPath(result.resultCode, session.reference);
      },
      onPaymentFailed(result) {
        location.href = resultPath(result?.resultCode, session.reference);
      },
      onError(error) {
        console.error("Drop-in error", error);
        location.href = resultPath("Error", session.reference);
      },
    });
    return new Dropin(checkoutUi, {
      paymentMethodsConfiguration: {
        card: {
          showBrandIcon: true,
          hasHolderName: true,
          holderNameRequired: true,
          amount: session.amount,
          placeholders: {
            cardNumber: "1234 5678 9012 3456",
            expiryDate: "MM/YY",
            securityCodeThreeDigits: "123",
            securityCodeFourDigits: "1234",
            holderName: "J. Smith",
          },
        },
      },
    }).mount(element);
  },
};
