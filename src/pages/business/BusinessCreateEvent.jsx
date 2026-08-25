import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/data";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import CreateEvent from "@/pages/CreateEvent";
import BusinessStripePanel from "@/components/business/BusinessStripePanel";
import EventCard from "@/components/EventCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Plus, ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BusinessCreateEvent() {
  const { data: business } = useActiveAccount();
  const [view, setView] = useState("list");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["businessEvents", business?.id],
    queryFn: () => api.entities.Event.filter({ business_id: business.id }, "-date"),
    enabled: !!business?.id,
    staleTime: 60 * 1000,
  });

  if (!business) return <LoadingSpinner fullScreen />;

  if (view === "create") {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setView("list")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-heading font-bold text-xl">Create Event</h1>
        </div>
        <CreateEvent business={business} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="font-heading font-bold text-xl flex-1">Events</h1>
        <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90" onClick={() => setView("create")}>
          <Plus className="w-4 h-4" /> New Event
        </Button>
      </div>

      <BusinessStripePanel business={business} />

      {isLoading ? (
        <LoadingSpinner />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center pt-8 pb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-heading font-semibold">No events yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Create your business's first event</p>
          <Button className="h-12 rounded-xl bg-primary font-semibold" onClick={() => setView("create")}>+ Create Event</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      <Link to="/business/past-events" className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <History className="w-3.5 h-3.5" /> View past events analytics
      </Link>
    </div>
  );
}