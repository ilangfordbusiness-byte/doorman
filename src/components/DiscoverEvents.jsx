import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import EventCard from "./EventCard";
import LoadingSpinner from "./LoadingSpinner";

export default function DiscoverEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    base44.entities.Event.filter({ status: "published", is_public: true }, "-date").then((data) => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  const filtered = events.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    (e.venue_name || "").toLowerCase().includes(search.toLowerCase())
  );

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

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Sparkles className="w-10 h-10 text-amber-400 mb-3" />
          <p className="font-heading font-semibold">No events found</p>
          <p className="text-sm text-muted-foreground mt-1">Check back soon for upcoming events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <Link key={event.id} to={`/invite/${event.invite_code}`}>
              <EventCard event={event} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}