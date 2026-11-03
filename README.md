# CoolBikesCo

A Dutch bike shop. Pick a bike, pay with Adyen Drop-in, and refund that payment from the invoice.

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
3. The result page is the invoice. A successful payment can be refunded from that page.

A redirect payment, such as iDEAL, returns through `/handleShopperRedirect`.

## Plugs

`src/index.js` is the only file that chooses the plugs.

| Port | Jobs | Plug |
| --- | --- | --- |
| Catalog | `listProducts`, `getProduct` | static bike list |
| Payments | `createSession`, `refund`, `submitRedirect`, `verifyWebhook` | Adyen, or the stand-in |
| Ledger | `record`, `list`, `getByReference` | memory |

Prices are minor units. `89900` is €899.00.
