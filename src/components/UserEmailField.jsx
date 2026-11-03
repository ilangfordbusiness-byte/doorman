import { useState, useEffect } from "react";
import { api } from "@/api/data";
import Avatar from "./Avatar";

// A text field that suggests existing DoorMan users as you type a name, while
// still accepting a free-typed email (or phone). Picking a suggestion calls
// onPick(email); pressing Enter calls onEnter so the parent can add the typed
// value. Used for adding co-hosts and door staff.
export default function UserEmailField({
  value, onChange, onPick, onEnter, placeholder, exclude = [], className = "",
}) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const excl = new Set((exclude || []).map((e) => String(e || "").toLowerCase()));

  useEffect(() => {
    const q = (value || "").trim();
    // searchProfiles matches names / instagram handles, so skip once it looks
    // like an email or phone — the free-text path handles those.
    if (q.length < 2 || q.includes("@") || /^[+\d]/.test(q)) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const people = await api.auth.searchProfiles(q);
        if (!cancelled) {
          setResults(people.filter((u) => u.email && !excl.has(u.email.toLowerCase())).slice(0, 6));
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative flex-1 min-w-0">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); onEnter?.(); } }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.email}
              type="button"
              // onMouseDown (not onClick) so it fires before the input's blur
              // closes the dropdown.
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onPick(u.email); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/70 text-left transition-colors"
            >
              <Avatar src={u.profile_picture} name={u.full_name || u.email} size="w-8 h-8" textClass="text-xs" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
