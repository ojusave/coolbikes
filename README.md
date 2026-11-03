# CoolBikesCo

A Dutch bike shop. Pick a bike, pay with Adyen Drop-in, and request a refund or cancellation from the invoice.

## Run

```bash
npm install
cp .env.example .env
npm start
```

Open http://127.0.0.1:4317

With `ADYEN_API_KEY` and `ADYEN_CLIENT_KEY` set, checkout uses Adyen's test environment. Without them, the stand-in payments plug is used so `npm test` can run offline.

## What the shopper does

1. Choose a bike.
2. Pay on the checkout page. Drop-in shows the payment methods.
3. The result page is the invoice. From it, request a refund or cancellation. The adapter uses `/reversals`: an uncaptured authorization can be cancelled, while a captured payment can be refunded. Request acceptance is not a final refund outcome.

A redirect payment, such as iDEAL, returns through `/handleShopperRedirect`.

## Case-study evidence

See [FRICTION.md](FRICTION.md) for recovered AI-workflow examples, the single proposed improvement, and exact bonus claims. The AI examples are explicitly attributed to the earlier TypeScript prototype, not this JavaScript implementation.

iDEAL reached the test simulator but completion was blocked in the embedded browser. A final refund outcome and real public webhook delivery are not established by the reviewed evidence. The webhook receiver checks HMAC only when `ADYEN_HMAC_KEY` is configured. Offline stand-in behavior is not proof of an Adyen transaction.

## Plugs

`src/index.js` is the only file that chooses the plugs. Each JSON route is a file in `src/api`.

| Port | Jobs | Plug |
| --- | --- | --- |
| Catalog | `listProducts`, `getProduct` | static bike list |
| Payments | `createSession`, `refund`, `submitRedirect`, `verifyWebhook` | Adyen, or the stand-in |
| Ledger | `record`, `list`, `getByReference` | memory |

Prices are minor units. `89900` is €899.00. Live API calls stay on the shop, checkout, and result pages. Open a call to read its request and response. `/traces` is the same stream on its own page.
