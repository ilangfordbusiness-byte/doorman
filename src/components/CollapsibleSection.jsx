import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

// A collapsible "dropdown" card used for the self-contained feature sections on
// the Profile page (DJ profile, Promoter, Payouts & Earnings). It starts open
// when the user already has information to show (`hasData`) and collapsed
// otherwise, so unused features stay tucked away while active ones show "as
// normal". Markup matches the rest of the profile cards.
export default function CollapsibleSection({ icon: Icon, title, hasData, children }) {
  const [open, setOpen] = useState(hasData);

  // Section data often loads asynchronously (promoter rows, Stripe status), so
  // auto-expand the first time `hasData` flips false -> true. A ref guard means
  // we never re-open a section the user has manually collapsed afterwards.
  const prev = useRef(hasData);
  useEffect(() => {
    if (hasData && !prev.current) setOpen(true);
    prev.current = hasData;
  }, [hasData]);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left"
      >
        <span className="font-heading font-semibold text-sm flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />} {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && <div className="border-t border-border/50">{children}</div>}
    </div>
  );
}
