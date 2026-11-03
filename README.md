# CoolBikesCo

A small Dutch bike shop built with **Adyen Sessions**, **Web Drop-in**, and **Node.js**. Choose a bike, pay in the test environment, inspect the API calls, and request a refund or cancellation from the invoice.

[Integration code](src/adapters/payments/adyenPayments.js) · [Developer experience notes](FRICTION.md)

## Run locally

You need Node.js and npm. For Adyen checkout, you also need a test account with a merchant account and API credentials.

```bash
git clone https://github.com/ojusave/coolbikes.git
cd coolbikes
npm install
cp .env.example .env
```

Fill in these values in `.env`:

| Key | Purpose |
| --- | --- |
| `ADYEN_API_KEY` | Server-side API authentication |
| `ADYEN_CLIENT_KEY` | Browser authentication for Drop-in |
| `ADYEN_MERCHANT_ACCOUNT` | Exact merchant account name used for payments |
| `ADYEN_ENVIRONMENT` | Keep `TEST` for this demo |

Generate and **save** the API key in the test Customer Area. Use the merchant account name, not the company account name or credential username. See Adyen's [API credentials guide](https://docs.adyen.com/development-resources/api-credentials/).

Add `http://127.0.0.1:4317` to the client credential's allowed origins. If you use a different host or port, allow that exact origin too. See [client-side authentication](https://docs.adyen.com/development-resources/client-side-authentication/).

```bash
npm start
```

Open **http://127.0.0.1:4317**. Restart the server after changing `.env`.

Without both API and client keys, the app selects the fake payments adapter. You can browse the catalog and run offline tests, but the checkout does **not** display a card form. With both keys set, a merchant account is also required to create a session.

## Try it

1. Choose a city, gravel, or cargo bike.
2. Select an available payment method in Drop-in and complete a test payment.
3. Open a call in the page's trace panel to inspect its request and response.
4. On the invoice, request a refund or cancellation when the action becomes available.
5. Use the payment reference to find the transaction and API logs in the test Customer Area. The app's traces are separate from Adyen's logs.

The shop uses country `NL` and catalog prices in EUR. Prices are stored in minor units: `89900` means €899.00.

| Local page | What it shows |
| --- | --- |
| `/` | Bike catalog |
| `/traces` | Full-width view of the API trace stream |
| `/webhooks` | Received webhook events |

## How it works

The server looks up the selected bike's price and creates an Adyen session. The browser mounts Drop-in with that session; card details are collected by Adyen's component. Redirect payments return through `/handleShopperRedirect`.

The invoice action calls Adyen's `/reversals` endpoint. It can cancel an uncaptured authorization or refund a captured payment. Acceptance of the request does not establish the final outcome.

The optional webhook receiver is `POST /api/webhooks`. To receive events from Adyen, expose it over public HTTPS and configure the webhook in the test Customer Area. Set `ADYEN_HMAC_KEY` to enable signature verification; the current receiver skips that check when the key is absent.

## Key files

| File | Responsibility |
| --- | --- |
| [src/index.js](src/index.js) | Selects the catalog, payments, and ledger adapters; starts the server |
| [src/api/checkoutSessions.js](src/api/checkoutSessions.js) | Creates checkout sessions using catalog prices |
| [src/adapters/payments/adyenPayments.js](src/adapters/payments/adyenPayments.js) | Adyen session, result, reversal, redirect, and webhook operations |
| [src/public/checkout-adyen.js](src/public/checkout-adyen.js) | Loads and mounts Web Drop-in |
| [src/api/refunds.js](src/api/refunds.js) | Handles invoice refund/cancellation requests |
| [src/api/webhooks.js](src/api/webhooks.js) | Receives and records notifications |
| [FRICTION.md](FRICTION.md) | Observed friction, AI workflow, and the proposed improvement |

Orders and events are held in memory. Restarting the server clears them. This is a developer-experience demo, not a production storefront.

## Tests

```bash
npm test
```

The tests use a fake payments adapter. They check adapter validation and the catalog → session → simulated webhook → invoice → refund-request flow, including duplicate-request rejection. They do not prove that an Adyen payment succeeded.

## Case-study status

The [friction log](FRICTION.md) records what was observed and what remains unverified:

- iDEAL reached the test simulator, but authorization did not complete in the embedded browser.
- A final refund outcome and actual webhook delivery from Adyen are not established by the recorded evidence.
- Recovered AI examples belong to the earlier TypeScript prototype and are labelled separately from this JavaScript implementation.

The single proposed improvement is a guided first-checkout check that makes credential and merchant configuration easier to diagnose.
