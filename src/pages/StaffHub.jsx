import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import PhonePrompt from "../components/PhonePrompt";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ScanLine, Calendar, MapPin, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "../components/LoadingSpinner";
import moment from "moment";

export default function StaffHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [myPhone, setMyPhone] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const me = await base44.auth.me();
    setMyPhone(me.phone || "");

    // Fetch by email and by phone, merge
    const byEmail = await base44.entities.EventStaff.filter({ staff_email: me.email });
    const byPhone = me.phone
      ? await base44.entities.EventStaff.filter({ staff_phone: me.phone })
      : [];
    const seen = new Set();
    const staffEntries = [...byEmail, ...byPhone].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    if (!staffEntries.length) {
      setLoading(false);
      return;
    }

    const eventIds = [...new Set(staffEntries.map((s) => s.event_id))];
    const eventsData = await Promise.all(
      eventIds.map(async (eid) => {
        const evts = await base44.entities.Event.filter({ id: eid });
        const evt = evts[0];
        const staffEntry = staffEntries.find((s) => s.event_id === eid);
        return evt ? { ...evt, staffRole: staffEntry?.role } : null;
      })
    );

    setEvents(eventsData.filter(Boolean));
    setLoading(false);
  }

  async function handleJoinByCode() {
    if (code.length !== 4) return;
    setJoining(true);
    const me = await base44.auth.me();

    // Find event with this staff_code
    const matched = await base44.entities.Event.filter({ staff_code: code });
    if (!matched.length) {
      toast({ title: "Invalid code", description: "No event found with that code." });
      setJoining(false);
      return;
    }
    const evt = matched[0];

    // Check if already staff
    const existing = await base44.entities.EventStaff.filter({ event_id: evt.id, staff_email: me.email });
    if (existing.length) {
      toast({ title: "Already added", description: `You're already staff for "${evt.title}".` });
      setJoining(false);
      setTab("events");
      return;
    }

    await base44.entities.EventStaff.create({
      event_id: evt.id,
      staff_email: me.email,
      staff_name: me.full_name || me.email,
      role: "doorman",
    });

    toast({ title: "Joined!", description: `You're now a doorman for "${evt.title}".` });
    setCode("");
    setJoining(false);
    setLoading(true);
    load();
    setTab("events");
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

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab("events")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "events" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Events
        </button>
        <button
          onClick={() => setTab("join")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "join" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Enter Code
        </button>
      </div>

      {tab === "join" && (
        <div className="flex flex-col items-center pt-6 pb-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <ScanLine className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">Enter Staff Code</h3>
          <p className="text-sm text-muted-foreground mb-6">Ask your host for the 4-digit code shown in their event manager</p>
          <div className="w-full max-w-xs space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              className="w-full h-16 text-center text-3xl font-bold tracking-[0.4em] bg-secondary/50 border border-border rounded-2xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              inputMode="numeric"
              onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
            />
            <Button
              className="w-full h-12 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={handleJoinByCode}
              disabled={code.length !== 4 || joining}
            >
              {joining ? "Joining..." : "Join Event"}
            </Button>
          </div>
        </div>
      )}

      {!myPhone && <PhonePrompt onSaved={(p) => { setMyPhone(p); load(); }} />}

      {tab === "events" && (
        loading ? (
          <LoadingSpinner />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <UserCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="font-heading font-semibold text-foreground">No events assigned</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Use <strong>Enter Code</strong> above to join an event with the code from your host.
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
                        <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{eventDate.format("MMM D")}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{event.start_time}</span>
                          {event.venue_name && (
                            <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{event.venue_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">{event.staffRole}</span>
                        <span className="text-xs text-muted-foreground">Tap to scan →</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}