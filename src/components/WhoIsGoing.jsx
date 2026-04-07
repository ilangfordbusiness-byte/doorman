import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users } from "lucide-react";

export default function WhoIsGoing({ eventId, myEmail }) {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.GuestlistEntry.filter({ event_id: eventId }).then((entries) => {
      const visible = entries.filter(
        (e) =>
          e.guest_email !== myEmail &&
          ["approved", "checked_in", "invited"].includes(e.status)
      );
      setGuests(visible);
      setLoading(false);
    });
  }, [eventId, myEmail]);

  if (loading) return null;
  if (guests.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-semibold text-sm">Who's Going ({guests.length})</h3>
      </div>
      <div className="space-y-2">
        {guests.slice(0, 10).map((g) => (
          <div key={g.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">
                {(g.guest_name || g.guest_email || "?")[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{g.guest_name || g.guest_email}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {g.status === "checked_in" ? "Checked In" : "Going"}
              </p>
            </div>
          </div>
        ))}
        {guests.length > 10 && (
          <p className="text-xs text-muted-foreground text-center pt-1">+{guests.length - 10} more going</p>
        )}
      </div>
    </div>
  );
}