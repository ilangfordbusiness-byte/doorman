import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import EventCard from "../components/EventCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Home() {
  const [user, setUser] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [myInvites, setMyInvites] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const me = await base44.auth.me();
    setUser(me);

    const [events, guestEntries, publicEvents] = await Promise.all([
      base44.entities.Event.filter({ host_email: me.email }, "-date"),
      base44.entities.GuestlistEntry.filter({ guest_email: me.email }, "-created_date"),
      base44.entities.Event.filter({ status: "published", is_public: true }, "-date", 20),
    ]);

    setMyEvents(events);
    setAllEvents(publicEvents);

    // For invites, fetch the related events
    if (guestEntries.length > 0) {
      const eventIds = [...new Set(guestEntries.map((g) => g.event_id))];
      const inviteEvents = await Promise.all(
        eventIds.map(async (id) => {
          const evts = await base44.entities.Event.filter({ id });
          const evt = evts[0];
          const entry = guestEntries.find((g) => g.event_id === id);
          return evt ? { ...evt, guestStatus: entry?.status, entryId: entry?.id } : null;
        })
      );
      setMyInvites(inviteEvents.filter(Boolean));
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">
            Hey, {user?.full_name?.split(" ")[0] || "there"} ✨
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your events & invites</p>
        </div>
        <Link to="/create-event">
          <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            New
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="invites" className="w-full">
        <TabsList className="w-full bg-secondary/50 border border-border rounded-xl p-1 mb-4">
          <TabsTrigger value="invites" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            My Invites
          </TabsTrigger>
          <TabsTrigger value="hosting" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Hosting
          </TabsTrigger>
          <TabsTrigger value="discover" className="flex-1 rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Discover
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="space-y-3">
          {myInvites.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-8 h-8 text-primary" />}
              title="No invites yet"
              subtitle="When you get invited to events, they'll show up here"
            />
          ) : (
            myInvites.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </TabsContent>

        <TabsContent value="hosting" className="space-y-3">
          {myEvents.length === 0 ? (
            <EmptyState
              icon={<Plus className="w-8 h-8 text-primary" />}
              title="No events yet"
              subtitle="Create your first event and start inviting"
              action={
                <Link to="/create-event">
                  <Button variant="outline" size="sm" className="mt-3 rounded-full">
                    Create Event
                  </Button>
                </Link>
              }
            />
          ) : (
            myEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </TabsContent>

        <TabsContent value="discover" className="space-y-3">
          {allEvents.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-8 h-8 text-primary" />}
              title="No public events"
              subtitle="Check back later for upcoming events"
            />
          ) : (
            allEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-heading font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      {action}
    </div>
  );
}