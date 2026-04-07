import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import EventCard from "../components/EventCard";

export default function HostHub() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    const me = await base44.auth.me();
    const data = await base44.entities.Event.filter({ host_email: me.email }, "-date");
    setEvents(data);
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-xl">My Events</h1>
          <p className="text-xs text-muted-foreground">Events you're hosting</p>
        </div>
        <Link to="/create-event">
          <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading font-semibold text-foreground">No events yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first event and start inviting</p>
          <Link to="/create-event">
            <Button variant="outline" size="sm" className="rounded-full">Create Event</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  );
}