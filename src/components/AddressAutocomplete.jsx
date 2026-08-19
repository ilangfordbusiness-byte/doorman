import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";

export default function AddressAutocomplete({ value, onChange, onPick, placeholder = "Search address or postcode…" }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [confirmed, setConfirmed] = useState(!!value);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const lastEmitted = useRef(value || "");

  // Sync from prop only when the value changed externally (e.g. async event load),
  // not when it changed because of our own typing/selection.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setQuery(value || "");
      setConfirmed(!!value);
      lastEmitted.current = value || "";
    }
  }, [value]);

  // Debounced autocomplete search via backend function (keeps API key server-side)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2 || confirmed) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke("placesAutocomplete", { action: "autocomplete", input: query });
        setSuggestions(res.data?.suggestions || []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, confirmed]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function selectSuggestion(s) {
    try {
      const res = await base44.functions.invoke("placesAutocomplete", { action: "details", place_id: s.place_id });
      const d = res.data;
      if (!d?.formatted_address) return;
      setQuery(d.formatted_address);
      setConfirmed(true);
      setOpen(false);
      setActive(-1);
      lastEmitted.current = d.formatted_address;
      onChange(d.formatted_address);
      onPick?.({ address: d.formatted_address, lat: d.lat, lng: d.lng, venue_name: d.name });
    } catch {
      /* ignore — user can retry */
    }
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); selectSuggestion(suggestions[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setConfirmed(false);
            lastEmitted.current = v;
            onChange(v);
          }}
          onFocus={() => { if (!confirmed && query.trim().length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="bg-secondary/50 border-border h-12 rounded-xl pl-10"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => selectSuggestion(s)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors ${i === active ? "bg-primary/10" : "hover:bg-secondary/50"}`}
            >
              <p className="text-sm text-foreground truncate">{s.description}</p>
            </button>
          ))}
        </div>
      )}

      {query && !confirmed && !loading && (
        <p className="text-xs text-amber-400 mt-1.5 px-1">Pick a suggestion to confirm the address — typed text won't be saved.</p>
      )}
    </div>
  );
}