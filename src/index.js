import { staticCatalog } from "./adapters/catalog/staticCatalog.js";
import { fakePayments } from "./adapters/payments/fakePayments.js";
import { createServer } from "./createServer.js";

// Composition root. This is the only file that chooses the plugs.
// Swap fakePayments() for the Adyen adapter when the test account exists.
const catalog = staticCatalog();
const payments = fakePayments();

const server = createServer({ catalog, payments });
const port = Number(process.env.PORT) || 4317;

server.listen(port, "127.0.0.1", () => {
  console.log(`CoolBikes http://127.0.0.1:${port}`);
  console.log(`catalog plug: static`);
  console.log(`payments plug: ${payments.name}`);
});
