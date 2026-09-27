import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import AttendeeList from "./AttendeeList";
import AttendeeSearchInput from "./AttendeeSearchInput";
import { useAllAttendees } from "@/hooks/useAllAttendees";
import { filterAttendees } from "@/lib/attendeeSearch";

// Full attendee list — one long scrollable list of everyone (no pages), with a
// search box that filters it by name, email or social handle. Each row opens
// the person's profile (via AttendeeList → SuggestionProfile).
export default function AttendeesModal({ eventId, myEmail, friends, sentSet, onSend, goingCount, initialQuery = "", onClose }) {
  const [query, setQuery] = useState(initialQuery);
  const { attendees, loading } = useAllAttendees(eventId, goingCount);
  const shown = filterAttendees(attendees, query);
  const searching = query.trim() !== "";

  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-0">
      <div className="bg-card rounded-3xl border border-border w-full max-w-lg max-h-[85dvh] md:max-h-[90dvh] flex flex-col">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm rounded-t-3xl px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-lg">Who's Going ({goingCount})</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <AttendeeSearchInput value={query} onChange={setQuery} autoFocus={!!initialQuery} className="mt-3" />
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
          ) : shown.length === 0 && searching ? (
            <p className="text-xs text-muted-foreground text-center py-10">No one going matches "{query.trim()}".</p>
          ) : (
            <AttendeeList attendees={shown} myEmail={myEmail} friends={friends} sentSet={sentSet} onSend={onSend} />
          )}
        </div>
      </div>
    </div>
  );
}
