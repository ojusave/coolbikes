import {
  CheckoutAPI,
  Client,
  Config,
  EnvironmentEnum,
  hmacValidator,
} from "@adyen/api-library";
import { annotate, span } from "../../trace.js";

export function adyenPayments(env = process.env) {
  const apiKey = required(env, "ADYEN_API_KEY");
  const clientKey = required(env, "ADYEN_CLIENT_KEY");
  const merchantAccount = env.ADYEN_MERCHANT_ACCOUNT || "";
  const hmacKey = env.ADYEN_HMAC_KEY || "";
  const environment =
    String(env.ADYEN_ENVIRONMENT || "TEST").toUpperCase() === "LIVE"
      ? EnvironmentEnum.LIVE
      : EnvironmentEnum.TEST;

  const config = new Config();
  config.apiKey = apiKey;
  config.environment = environment;
  config.applicationName = "CoolBikesCo case study";

  const checkout = new CheckoutAPI(new Client(config));
  const validator = new hmacValidator();

  return {
    name: "adyen",
    async createSession(request) {
      if (!merchantAccount) {
        const error = new Error("Missing ADYEN_MERCHANT_ACCOUNT.");
        error.statusCode = 400;
        throw error;
      }
      const response = await span(
        "POST /v72/sessions",
        {
          auth: "X-API-Key",
          merchantAccount,
          amount: request.amount,
          reference: request.reference,
          countryCode: request.countryCode,
          channel: request.channel ?? "Web",
        },
        async () => {
          const created = await checkout.PaymentsApi.sessions({
            merchantAccount,
            amount: request.amount,
            reference: request.reference,
            returnUrl: request.returnUrl,
            countryCode: request.countryCode,
            channel: request.channel ?? "Web",
            shopperLocale: request.shopperLocale ?? "en-NL",
          });
          annotate({ httpStatus: 201, sessionId: created.id });
          return created;
        },
      );

      return {
        provider: "adyen",
        id: response.id,
        sessionData: response.sessionData,
        clientKey,
        environment: environment === EnvironmentEnum.LIVE ? "live" : "test",
        amount: request.amount,
        countryCode: request.countryCode,
        reference: request.reference,
        returnUrl: request.returnUrl,
        channel: request.channel ?? "Web",
      };
    },
    async refund(request) {
      const response = await span(
        "POST /payments/{psp}/refunds",
        {
          paymentPspReference: request.paymentPspReference,
          amount: request.amount,
          reference: request.reference,
        },
        async () => {
          const refunded = await checkout.ModificationsApi.refundCapturedPayment(
            request.paymentPspReference,
            {
              merchantAccount,
              amount: request.amount,
              reference: request.reference,
            },
          );
          annotate({
            httpStatus: 201,
            pspReference: refunded.pspReference,
            result: refunded.status ?? "received",
          });
          return refunded;
        },
      );

      return {
        provider: "adyen",
        status: response.status ?? "received",
        pspReference: response.pspReference,
        paymentPspReference: request.paymentPspReference,
        amount: request.amount ?? null,
        reference: request.reference,
      };
    },
    async submitRedirect(request) {
      const response = await span("POST /v72/payments/details", {}, async () => {
        const details = await checkout.PaymentsApi.paymentsDetails({
          details: { redirectResult: request.redirectResult },
        });
        annotate({
          resultCode: details.resultCode,
          pspReference: details.pspReference,
          merchantReference: details.merchantReference,
        });
        return details;
      });

      return {
        provider: "adyen",
        resultCode: response.resultCode,
        pspReference: response.pspReference,
        merchantReference: response.merchantReference,
        sessionResult: response.sessionResult,
      };
    },
    async verifyWebhook(body) {
      return span("adyen.verifyWebhook", { hmac: hmacKey ? "checked" : "not-configured" }, async () => {
        const items = [];
        for (const wrapper of body?.notificationItems ?? []) {
          const item = wrapper.NotificationRequestItem;
          if (!item) continue;
          if (hmacKey && !validator.validateHMAC(item, hmacKey)) {
            const error = new Error("Invalid Adyen HMAC signature");
            error.statusCode = 401;
            throw error;
          }
          items.push(item);
        }
        const first = items[0];
        annotate({
          count: items.length,
          eventCode: first?.eventCode,
          reference: first?.merchantReference,
          pspReference: first?.pspReference,
          success: first?.success,
        });
        return { provider: "adyen", ok: true, items };
      });
    },
  };
}

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Put it in .env after the Customer Area setup.`);
  }
  return value;
}
