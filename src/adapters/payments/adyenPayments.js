// Talks to Adyen's test Checkout API.
// createSession asks Adyen to open a checkout. Drop-in in the browser then
// shows the payment methods. The card number never comes to this server.
// A refund is a later call, after the payment has a pspReference.
// Adyen answers "received". The refund is finished when a webhook arrives.

import {
  CheckoutAPI,
  Client,
  Config,
  EnvironmentEnum,
  hmacValidator,
} from "@adyen/api-library";
import { annotate, exchange, originalRequest, span } from "../../trace.js";

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

  const client = new Client(config);
  // Record the request Adyen actually receives: method, URL, and body.
  const http = client.httpClient;
  const send = http.request.bind(http);
  http.request = (endpoint, json, requestConfig, isApiRequired, requestOptions = {}) => {
    const method = requestOptions.method || "POST";
    exchange({ request: originalRequest(method, endpoint, json) });
    return send(endpoint, json, requestConfig, isApiRequired, requestOptions);
  };
  const checkout = new CheckoutAPI(client);
  const validator = new hmacValidator();

  return {
    name: "adyen",
    async createSession(request) {
      if (!merchantAccount) {
        const error = new Error("Missing ADYEN_MERCHANT_ACCOUNT.");
        error.statusCode = 400;
        throw error;
      }
      const payload = {
        merchantAccount,
        amount: request.amount,
        reference: request.reference,
        returnUrl: request.returnUrl,
        countryCode: request.countryCode,
        channel: request.channel ?? "Web",
        shopperLocale: request.shopperLocale ?? "en-NL",
      };
      const response = await span(
        "POST /v72/sessions",
        { auth: "X-API-Key", merchantAccount, reference: request.reference },
        async () => {
          const created = await checkout.PaymentsApi.sessions(payload);
          annotate({ httpStatus: 201, sessionId: created.id });
          exchange({ response: created });
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
    async getSessionResult(request) {
      return span("GET /sessions/{id}", { sessionId: request.sessionId }, async () => {
        const response = await checkout.PaymentsApi.getResultOfPaymentSession(
          request.sessionId,
          request.sessionResult,
        );
        const payment = response.payments?.[0];
        const method = payment?.paymentMethod;
        annotate({
          httpStatus: 200,
          status: response.status,
          resultCode: payment?.resultCode,
          pspReference: payment?.pspReference,
          reference: response.reference,
        });
        exchange({ response });
        return {
          provider: "adyen",
          status: response.status,
          reference: response.reference,
          pspReference: payment?.pspReference ?? null,
          resultCode: payment?.resultCode ?? null,
          amount: payment?.amount ?? null,
          paymentMethod: method?.brand || method?.type || null,
        };
      });
    },
    async refund(request) {
      // A card payment is often only authorised, not captured yet.
      // /refunds rejects that. /reversals refunds a capture and cancels an authorisation.
      const payload = {
        merchantAccount,
        reference: `refund-${request.reference}`,
      };
      const response = await span(
        "POST /payments/{psp}/reversals",
        { paymentPspReference: request.paymentPspReference, reference: request.reference },
        async () => {
          const refunded = await checkout.ModificationsApi.refundOrCancelPayment(
            request.paymentPspReference,
            payload,
          );
          annotate({
            httpStatus: 201,
            pspReference: refunded.pspReference,
            result: refunded.status ?? "received",
          });
          exchange({ response: refunded });
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
      const payload = { details: { redirectResult: request.redirectResult } };
      const response = await span("POST /v72/payments/details", {}, async () => {
        const details = await checkout.PaymentsApi.paymentsDetails(payload);
        annotate({
          httpStatus: 200,
          resultCode: details.resultCode,
          pspReference: details.pspReference,
          merchantReference: details.merchantReference,
        });
        exchange({ response: details });
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
