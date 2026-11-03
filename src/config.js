import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnvFile(path = join(root, ".env")) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = stripQuotes(raw.trim());
  }
}

export function choosePayments() {
  if (process.env.ADYEN_API_KEY && process.env.ADYEN_CLIENT_KEY) return "adyen";
  return "fake";
}

export function shopSettings(env = process.env) {
  return {
    countryCode: env.SHOP_COUNTRY || "NL",
    locale: env.SHOP_LOCALE || "en-US",
    currency: env.SHOP_CURRENCY || "EUR",
  };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
