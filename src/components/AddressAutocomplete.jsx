import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function AddressAutocomplete({ value, onChange, onPick, placeholder = "Start typing address or postcode…" }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  // Keep internal query synced when external value changes (e.g. form load)
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Debounced search via Nominatim (free, no API key)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setSuggestions(data || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectSuggestion(s) {
    const label = s.display_name;
    setQuery(label);
    setOpen(false);
    setActive(-1);
    onChange(label);
    if (onPick) {
      onPick({
        address: label,
        lat: parseFloat(s.lat),
        lng: parseFloat(s.lon),
        venue_name: s.name && s.name !== label ? s.name : "",
      });
    }
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length >= 3 && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-secondary/50 border-border h-12 rounded-xl pl-10"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => selectSuggestion(s)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/50 last:border-b-0 transition-colors ${
                i === active ? "bg-primary/10" : "hover:bg-secondary/50"
              }`}
            >
              {s.name && s.name !== s.display_name ? (
                <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
              ) : null}
              <p className="text-xs text-muted-foreground truncate">{s.display_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}