import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ScanLine, Calendar, MapPin, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

export default function StaffHub() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const me = await base44.auth.me();
    const staffEntries = await base44.entities.EventStaff.filter({ staff_email: me.email });

    if (!staffEntries.length) {
      setLoading(false);
      return;
    }

    const eventIds = [...new Set(staffEntries.map((s) => s.event_id))];
    const eventsData = await Promise.all(
      eventIds.map(async (id) => {
        const evts = await base44.entities.Event.filter({ id });
        const evt = evts[0];
        const staffEntry = staffEntries.find((s) => s.event_id === id);
        return evt ? { ...evt, staffRole: staffEntry?.role } : null;
      })
    );

    setEvents(eventsData.filter(Boolean));
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
        <h1 className="font-heading font-bold text-xl">Doorman / Staff</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center pt-8 pb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <UserCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="font-heading font-semibold text-foreground">No events assigned</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Ask your host to add you as a doorman. They'll need your email address.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-4">
            Your assigned events
          </p>
          {events.map((event) => {
            const eventDate = moment(event.date);
            return (
              <button
                key={event.id}
                onClick={() => navigate(`/scanner?event_id=${event.id}`)}
                className="w-full text-left group"
              >
                <div className="relative rounded-2xl overflow-hidden bg-card border border-border hover:border-emerald-500/40 transition-all duration-200">
                  {event.cover_image && (
                    <div className="h-28 overflow-hidden">
                      <img
                        src={event.cover_image}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                    </div>
                  )}
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <ScanLine className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-base text-foreground truncate">{event.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {eventDate.format("MMM D")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {event.start_time}
                        </span>
                        {event.venue_name && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {event.venue_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {event.staffRole}
                      </span>
                      <span className="text-xs text-muted-foreground">Tap to scan →</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}