import { staticCatalog } from "./adapters/catalog/staticCatalog.js";
import { memoryLedger } from "./adapters/ledger/memoryLedger.js";
import { adyenPayments } from "./adapters/payments/adyenPayments.js";
import { fakePayments } from "./adapters/payments/fakePayments.js";
import { choosePayments, loadEnvFile, shopSettings } from "./config.js";
import { createServer } from "./createServer.js";

loadEnvFile();

// Composition root. This is the only file that chooses the plugs.
const catalog = staticCatalog();
const ledger = memoryLedger();
const shop = shopSettings();
const payments = choosePayments() === "adyen" ? adyenPayments() : fakePayments();

const server = createServer({ catalog, payments, ledger, shop });
const port = Number(process.env.PORT) || 4317;
const host = process.env.HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`CoolBikes http://${host}:${port}`);
  console.log(`catalog plug: static`);
  console.log(`payments plug: ${payments.name}`);
  console.log(`ledger plug: memory`);
  console.log(`shop: ${shop.countryCode} ${shop.currency}`);
});
