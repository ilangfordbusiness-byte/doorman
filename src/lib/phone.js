// Phone normalization + display helpers. Storage format is E.164 ("+447700900123");
// anything unparseable is stored as typed (lenient policy — never block a save).
// The SQL twin of normalizePhone lives in the phone_normalization migration.
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountryCallingCode,
} from "libphonenumber-js/min";

export const DEFAULT_COUNTRY = "GB";

// Curated for the app's GBP/EUR/USD audiences; GB first. PhoneInput appends a
// synthetic entry for any other country detected from a "+CC" prefix.
export const COUNTRIES = [
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "IE", name: "Ireland", dial: "+353", flag: "🇮🇪" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
  { code: "AT", name: "Austria", dial: "+43", flag: "🇦🇹" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
  { code: "CZ", name: "Czechia", dial: "+420", flag: "🇨🇿" },
  { code: "GR", name: "Greece", dial: "+30", flag: "🇬🇷" },
  { code: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
  { code: "HU", name: "Hungary", dial: "+36", flag: "🇭🇺" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
];

// E.164 when the input parses to a possible number, otherwise trimmed as typed.
export function normalizePhone(raw, defaultCountry = DEFAULT_COUNTRY) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  return parsed && parsed.isPossible() ? parsed.number : text;
}

// E.164 → international format with the dial code ("+44 7700 900123") for all
// read-only displays, so numbers are unambiguous across regions; non-E.164
// values come back as-is.
export function formatPhoneDisplay(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("+")) return text;
  const parsed = parsePhoneNumberFromString(text);
  return parsed ? parsed.formatInternational() : text;
}

// E.164 → national format ("07700 900123") for seeding PhoneInput's text
// field, whose country dropdown already carries the dial code; non-E.164
// values come back as-is.
export function formatPhoneEditText(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("+")) return text;
  const parsed = parsePhoneNumberFromString(text);
  return parsed ? parsed.formatNational() : text;
}

// One keystroke's worth of as-you-type formatting. When the text starts with
// "+", parsing is country-agnostic and may resolve a different country than
// the dropdown shows — return it so the dropdown can follow.
export function formatAsYouType(text, country) {
  const typer = new AsYouType(text.startsWith("+") ? undefined : country);
  const formatted = typer.input(text);
  return { country: typer.country || country, formatted };
}

// National significant digits of a parseable value ("+447700900123" →
// "7700900123"), or null — lets PhoneInput re-home a number when the
// country dropdown changes.
export function parseNational(text, country) {
  const parsed = parsePhoneNumberFromString(String(text ?? "").trim(), country);
  return parsed ? parsed.nationalNumber : null;
}

// ISO country of a stored value, e.g. "+33612345678" → "FR"; null if unknown.
// For calling codes shared by several countries the parser leaves country
// undefined — fall back to the curated entry for that dial code.
export function countryFromValue(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(text);
  if (!parsed) return null;
  if (parsed.country) return parsed.country;
  return COUNTRIES.find((c) => c.dial === "+" + parsed.countryCallingCode)?.code ?? null;
}

// Dropdown entry for any ISO code — curated when we have it, synthesized
// (flag from regional-indicator codepoints) for countries outside COUNTRIES.
export function countryEntry(code) {
  const curated = COUNTRIES.find((c) => c.code === code);
  if (curated) return curated;
  try {
    return {
      code,
      name: code,
      dial: "+" + getCountryCallingCode(code),
      flag: String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))),
    };
  } catch {
    return null;
  }
}
