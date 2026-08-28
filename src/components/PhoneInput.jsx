import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryEntry,
  countryFromValue,
  formatAsYouType,
  formatPhoneEditText,
  normalizePhone,
  parseNational,
} from "@/lib/phone";

// Country dial-code dropdown + tel input. `value`/`onChange` speak a single
// string: E.164 when the number parses, the raw text otherwise (lenient) —
// so callers keep their plain useState("") + save flows.
export default function PhoneInput({
  value = "",
  onChange,
  defaultCountry = DEFAULT_COUNTRY,
  placeholder,
  className = "",
  autoFocus,
  onEnter,
  id,
}) {
  const [country, setCountry] = useState(() => countryFromValue(value) || defaultCountry);
  const [text, setText] = useState(() => formatPhoneEditText(value));
  const lastEmitted = useRef(value);

  // Follow external resets (e.g. a form clearing after submit) without
  // fighting the user's in-progress typing.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setCountry(countryFromValue(value) || defaultCountry);
    setText(formatPhoneEditText(value));
  }, [value, defaultCountry]);

  function emit(nextText, nextCountry) {
    const normalized = normalizePhone(nextText, nextCountry);
    lastEmitted.current = normalized;
    onChange?.(normalized);
  }

  function handleTextChange(e) {
    const raw = e.target.value;
    // Formatters can't handle deletions mid-string; only format while appending.
    const { country: resolved, formatted } =
      raw.length > text.length ? formatAsYouType(raw, country) : { country, formatted: raw };
    if (resolved !== country) setCountry(resolved);
    setText(formatted);
    emit(formatted, resolved);
  }

  function handleCountryChange(code) {
    setCountry(code);
    // Re-home an international value under the new country; keep national text.
    const national = parseNational(text, country);
    const nextText = text.startsWith("+") && national ? national : text;
    setText(nextText);
    emit(nextText, code);
  }

  // Only the UK gets an example number; other regions' formats vary too much
  // for one sample to look right, so they fall back to a generic hint.
  const effectivePlaceholder =
    placeholder ?? (country === "GB" ? "07700 900123" : "Phone number");

  const entries = countryEntry(country)
    ? COUNTRIES.some((c) => c.code === country)
      ? COUNTRIES
      : [...COUNTRIES, countryEntry(country)]
    : COUNTRIES;
  const selected = countryEntry(country);

  return (
    <div
      className={cn(
        "flex items-stretch bg-secondary/50 border border-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-ring",
        className
      )}
    >
      <Select value={country} onValueChange={handleCountryChange}>
        <SelectTrigger
          aria-label="Country code"
          className="w-auto shrink-0 h-full border-0 bg-transparent shadow-none rounded-none px-2.5 gap-1 focus:ring-0 text-sm"
        >
          <span className="flex items-center gap-1.5">
            <span>{selected?.flag}</span>
            <span className="text-muted-foreground">{selected?.dial}</span>
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {entries.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span>{c.flag}</span>
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.dial}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="w-px my-2 bg-border" />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={text}
        onChange={handleTextChange}
        placeholder={effectivePlaceholder}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="flex-1 min-w-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
