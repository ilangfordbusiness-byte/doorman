// Currency helpers shared by pages. Money is integer minor units everywhere
// except display (see docs/STANDARDS.md); the fee maths lives in fees.js.
import { countryFromValue } from "@/lib/phone";

const EURO_COUNTRIES = new Set([
  "IE", "FR", "DE", "ES", "IT", "PT", "NL", "BE", "AT", "FI", "GR", "EE", "LV",
  "LT", "LU", "MT", "CY", "SI", "SK", "HR",
]);

// Sensible event currency for a host in `country` (ISO-3166 alpha-2).
export function defaultCurrencyForCountry(country) {
  const c = String(country || "").toUpperCase();
  if (c === "US" || c === "CA") return "usd";
  if (EURO_COUNTRIES.has(c)) return "eur";
  return "gbp";
}

// Event currency to preselect for a host: their connected Stripe account's
// settlement currency when we know it (a payout in any other currency gets
// converted), otherwise inferred from their phone's country, else GBP.
export function defaultCurrencyForUser(user) {
  const stripeCur = String(user?.stripe_default_currency || "").toLowerCase();
  if (["gbp", "eur", "usd"].includes(stripeCur)) return stripeCur;
  return defaultCurrencyForCountry(countryFromValue(user?.phone));
}
