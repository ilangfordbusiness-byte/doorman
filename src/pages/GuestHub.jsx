import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Sparkles, QrCode, Clock, CheckCircle2, Link as LinkIcon } from "lucide-react";
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
        <div className="flex flex-col items-center pt-4 pb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="font-heading font-semibold text-foreground">No invites yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-8">When you get invited to events, they'll show up here</p>
          <div className="w-full text-left space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">What to expect</p>
            {[
              { icon: <LinkIcon className="w-4 h-4 text-amber-400" />, title: "Receive an invite link", desc: "A host shares a unique link with you" },
              { icon: <Clock className="w-4 h-4 text-violet-400" />, title: "Request to join", desc: "Submit your request — the host approves you" },
              { icon: <QrCode className="w-4 h-4 text-emerald-400" />, title: "Get your QR pass", desc: "Once approved, open your digital pass" },
              { icon: <CheckCircle2 className="w-4 h-4 text-sky-400" />, title: "Show at the door", desc: "Doorman scans your code to check you in" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-secondary/40 rounded-xl p-4 border border-border/50">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">{step.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {inviteEvents.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  );
}