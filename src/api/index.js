// One file per API. The server tries them in this order.

import { handle as checkoutSessions } from "./checkoutSessions.js";
import { handle as config } from "./config.js";
import { handle as orders } from "./orders.js";
import { handle as payments } from "./payments.js";
import { handle as products } from "./products.js";
import { handle as redirect } from "./redirect.js";
import { handle as refunds } from "./refunds.js";
import { handle as shopperRedirect } from "./shopperRedirect.js";
import { handle as traces } from "./traces.js";
import { handle as webhooks } from "./webhooks.js";

export const apis = [
  traces,
  config,
  products,
  checkoutSessions,
  shopperRedirect,
  redirect,
  webhooks,
  orders,
  payments,
  refunds,
];
