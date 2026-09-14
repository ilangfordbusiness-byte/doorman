// Currency helpers shared by pages. Money is integer minor units everywhere
// except display (see docs/STANDARDS.md); the fee maths lives in fees.js.
import { countryFromValue } from "@/lib/phone";
import { FEE_FIXED_MINOR, FEE_PERCENT } from "@/lib/fees";

export const CURRENCY_SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// "£" / "€" / "$" for a currency code; "" for anything unknown, never a
// hardcoded pound sign.
export function currencySymbol(code) {
  return CURRENCY_SYMBOL[String(code || "gbp").toLowerCase()] || "";
}

// Major units in ("12.5") -> "$12.50".
export function formatMajor(major, code) {
  return `${currencySymbol(code)}${(Number(major) || 0).toFixed(2)}`;
}

// Minor units in (1250) -> "$12.50". Mirrors formatMoney in
// supabase/functions/_shared/tickets.ts.
export function formatMoney(minor, code) {
  return formatMajor((Number(minor) || 0) / 100, code);
}

// The platform fee as copy: "45p + 4% per ticket", "45¢ + 4% per ticket",
// "€0.45 + 4% per ticket".
export function feeLabel(code) {
  const c = String(code || "gbp").toLowerCase();
  const fixed = c === "gbp" ? `${FEE_FIXED_MINOR}p`
    : c === "usd" ? `${FEE_FIXED_MINOR}¢`
    : `${currencySymbol(c)}${(FEE_FIXED_MINOR / 100).toFixed(2)}`;
  return `${fixed} + ${Math.round(FEE_PERCENT * 100)}% per ticket`;
}

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
