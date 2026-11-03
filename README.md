# CoolBikesCo

Adyen case study shop: pick a Dutch bike, pay through a swappable payments plug, refund through the API.

## Plugs

| Port | Methods | Adapters |
| --- | --- | --- |
| Catalog | `listProducts`, `getProduct` | `staticCatalog` |
| Payments | `createSession`, `refund`, `submitRedirect`, `verifyWebhook` | `fakePayments`, `adyenPayments` |
| Ledger | `record`, `list`, `getByReference` | `memoryLedger` |

`src/index.js` is the only place that chooses plugs. Without Adyen env vars it uses the fake plug so the shop is end-to-end locally. With env vars it swaps in Adyen Drop-in /sessions.

## Run

```bash
npm install
npm start
```

Open http://127.0.0.1:4317

```bash
npm test
```

## Plug in Adyen

1. Open the test account email for `NAAccount827` and set the password.
2. In Customer Area: Developers → API credentials → generate API key and client key. Add `http://127.0.0.1:4317` as an allowed origin.
3. Copy `.env.example` to `.env` and fill `ADYEN_API_KEY`, `ADYEN_MERCHANT_ACCOUNT`, `ADYEN_CLIENT_KEY`.
4. Restart. Checkout mounts real Drop-in.
5. For webhooks and iDEAL: expose the app publicly, set Developers → Webhooks to `https://YOUR_HOST/api/webhooks`, put the HMAC in `ADYEN_HMAC_KEY`.

## Case study mapping

- Product list + select: `/`
- Payment methods + card: Drop-in in `#dropin` (or the fake stand-in)
- Customer Area: use the pspReference from Payments after a test charge
- Bonus refund: Refund via API on a recorded payment
- Bonus webhook: `POST /api/webhooks/adyen`
- Bonus iDEAL: enabled by country `NL` once Adyen methods are live; redirect returns through `/api/redirect`
