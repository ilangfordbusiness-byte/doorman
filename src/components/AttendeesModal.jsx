import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, Loader2 } from "lucide-react";
import AttendeeList from "./AttendeeList";

const BATCH = 100; // the RPC clamps limit to <= 100, so page through in 100s

// Full attendee list — one long scrollable list of everyone (no pages). Each
// row opens the person's profile (via AttendeeList → SuggestionProfile).
export default function AttendeesModal({ eventId, myEmail, friends, sentSet, onSend, goingCount, onClose }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all = [];
      try {
        for (let offset = 0; ; offset += BATCH) {
          const res = await api.functions.invoke("getEventAttendees", { event_id: eventId, offset, limit: BATCH });
          const batch = res.data?.attendees || [];
          all.push(...batch);
          if (batch.length < BATCH) break;              // last page reached
          if (all.length >= (goingCount || 0)) break;   // safety bound
        }
      } catch { /* keep whatever loaded */ }
      if (!cancelled) { setAttendees(all); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [eventId, goingCount]);

  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-0">
      <div className="bg-card rounded-3xl border border-border w-full max-w-lg max-h-[85dvh] md:max-h-[90dvh] flex flex-col">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm rounded-t-3xl px-5 pt-5 pb-3 flex items-center justify-between border-b border-border/50">
          <h2 className="font-heading font-bold text-lg">Who's Going ({goingCount})</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
          ) : (
            <AttendeeList attendees={attendees} myEmail={myEmail} friends={friends} sentSet={sentSet} onSend={onSend} />
          )}
        </div>
      </div>
    </div>
  );
}
