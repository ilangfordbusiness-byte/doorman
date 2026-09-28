import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import moment from "moment";
import { api } from "@/api/data";
import { Search, Sparkles, History, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import EventCard from "./EventCard";
import LoadingSpinner from "./LoadingSpinner";

export default function DiscoverEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    api.entities.Event.filter({ status: "published" }, "-date")
      .then((data) => setEvents(data.filter((e) => e.is_public || e.discoverable)))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return events.filter((e) =>
      (e.title || "").toLowerCase().includes(q) || (e.venue_name || "").toLowerCase().includes(q));
  }, [events, search]);

  // Split on the event date: upcoming (today onward) shown by default, past behind a toggle.
  const today = moment().startOf("day");
  const upcoming = filtered
    .filter((e) => moment(e.date).isSameOrAfter(today))
    .sort((a, b) => moment(a.date).valueOf() - moment(b.date).valueOf()); // soonest first
  const past = filtered
    .filter((e) => moment(e.date).isBefore(today))
    .sort((a, b) => moment(b.date).valueOf() - moment(a.date).valueOf()); // most recent first

  const list = showPast ? past : upcoming;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary/50 border-border h-11 rounded-xl"
        />
      </div>

      {showPast && (
        <button onClick={() => setShowPast(false)} className="flex items-center gap-1.5 text-sm text-primary font-medium">
          <ChevronLeft className="w-4 h-4" /> Back to upcoming
        </button>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Sparkles className="w-10 h-10 text-amber-400 mb-3" />
          <p className="font-heading font-semibold">{showPast ? "No past events" : "No upcoming events"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {showPast ? "Nothing in the archive yet." : "Check back soon for upcoming events"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((event) => (
            <Link key={event.id} to={`/invite/${event.invite_code}`}>
              <EventCard event={event} />
            </Link>
          ))}
        </div>
      )}

      {!showPast && past.length > 0 && (
        <button
          onClick={() => setShowPast(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border/50 bg-secondary/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <History className="w-4 h-4" /> View past events ({past.length})
        </button>
      )}
    </div>
  );
}
