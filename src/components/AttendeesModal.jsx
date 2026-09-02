import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AttendeeList from "./AttendeeList";

const PAGE_SIZE = 50;

// Full attendee list, paged in batches of 50 with Prev/Next. Each row opens the
// person's profile (via AttendeeList → SuggestionProfile).
export default function AttendeesModal({ eventId, myEmail, friends, sentSet, onSend, goingCount, onClose }) {
  const [page, setPage] = useState(0); // 0-based
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const totalPages = Math.max(1, Math.ceil((goingCount || 0) / PAGE_SIZE));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.functions.invoke("getEventAttendees", { event_id: eventId, offset: page * PAGE_SIZE, limit: PAGE_SIZE })
      .then((res) => { if (!cancelled) setAttendees(res.data?.attendees || []); })
      .catch(() => { if (!cancelled) setAttendees([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, page]);

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

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border/50">
            <Button variant="outline" size="sm" className="rounded-xl gap-1"
              disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground font-medium">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" className="rounded-xl gap-1"
              disabled={loading || page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
