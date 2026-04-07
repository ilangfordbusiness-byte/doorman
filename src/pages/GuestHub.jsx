import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import EventCard from "../components/EventCard";

export default function GuestHub() {
  const [inviteEvents, setInviteEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    const me = await base44.auth.me();
    const entries = await base44.entities.GuestlistEntry.filter({ guest_email: me.email }, "-created_date");

    if (entries.length === 0) {
      setLoading(false);
      return;
    }

    const eventIds = [...new Set(entries.map((g) => g.event_id))];
    const events = await Promise.all(
      eventIds.map(async (id) => {
        const evts = await base44.entities.Event.filter({ id });
        const evt = evts[0];
        const entry = entries.find((g) => g.event_id === id);
        return evt ? { ...evt, guestStatus: entry?.status, entryId: entry?.id } : null;
      })
    );
    setInviteEvents(events.filter(Boolean));
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
          <h1 className="font-heading font-bold text-xl">My Invites</h1>
          <p className="text-xs text-muted-foreground">Events you're attending</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : inviteEvents.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading font-semibold text-foreground">No invites yet</h3>
          <p className="text-sm text-muted-foreground mt-1">When you get invited to events, they'll show up here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inviteEvents.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  );
}