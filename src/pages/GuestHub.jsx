import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PhonePrompt from "../components/PhonePrompt";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Sparkles, QrCode, Clock, CheckCircle2, Link as LinkIcon, Compass, ArrowLeftRight, Check, X } from "lucide-react";
import DiscoverEvents from "../components/DiscoverEvents";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import EventCard from "../components/EventCard";
import LoadingSpinner from "../components/LoadingSpinner";

export default function GuestHub() {
  const { toast } = useToast();
  const [tab, setTab] = useState("invites");
  const [inviteEvents, setInviteEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPhone, setMyPhone] = useState("");
  const [transfersIn, setTransfersIn] = useState([]);
  const [transfersOut, setTransfersOut] = useState([]);
  const [transferBusy, setTransferBusy] = useState(null);

  useEffect(() => {
    loadInvites();
    loadTransfers();
  }, []);

  async function loadInvites() {
    const me = await base44.auth.me();
    setMyPhone(me.phone || "");

    const byEmail = await base44.entities.GuestlistEntry.filter({ guest_email: me.email }, "-created_date");
    const byPhone = me.phone
      ? await base44.entities.GuestlistEntry.filter({ guest_phone: me.phone }, "-created_date")
      : [];
    const seen = new Set();
    const entries = [...byEmail, ...byPhone].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    if (entries.length === 0) {
      setLoading(false);
      return;
    }

    const eventIds = [...new Set(entries.map((g) => g.event_id))];
    const events = await Promise.all(
      eventIds.map(async (eid) => {
        const evts = await base44.entities.Event.filter({ id: eid });
        const evt = evts[0];
        const entry = entries.find((g) => g.event_id === eid);
        return evt ? { ...evt, guestStatus: entry?.status, entryId: entry?.id } : null;
      })
    );
    setInviteEvents(events.filter(Boolean));
    setLoading(false);
  }

  async function loadTransfers() {
    try {
      const me = await base44.auth.me();
      const [incoming, outgoing] = await Promise.all([
        base44.entities.TicketTransfer.filter({ recipient_email: me.email, status: "pending" }, "-created_date"),
        base44.entities.TicketTransfer.filter({ sender_email: me.email, status: "pending" }, "-created_date"),
      ]);
      setTransfersIn(incoming);
      setTransfersOut(outgoing);
    } catch {}
  }

  async function acceptTransfer(t) {
    setTransferBusy(t.id);
    try {
      const res = await base44.functions.invoke("acceptTicketTransfer", { transfer_id: t.id });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Ticket accepted!", description: "It's now in your invites." });
      loadTransfers();
      loadInvites();
    } catch (e) {
      toast({ title: "Couldn't accept", description: e.message, variant: "destructive" });
    }
    setTransferBusy(null);
  }

  async function declineTransfer(t) {
    setTransferBusy(t.id);
    try {
      await base44.entities.TicketTransfer.update(t.id, { status: "declined" });
      toast({ title: "Transfer declined" });
      loadTransfers();
    } catch {
      toast({ title: "Couldn't decline", variant: "destructive" });
    }
    setTransferBusy(null);
  }

  async function cancelTransfer(t) {
    setTransferBusy(t.id);
    try {
      await base44.entities.TicketTransfer.update(t.id, { status: "cancelled", cancelled_at: new Date().toISOString() });
      toast({ title: "Transfer cancelled" });
      loadTransfers();
    } catch {
      toast({ title: "Couldn't cancel", variant: "destructive" });
    }
    setTransferBusy(null);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-xl">Guest</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab("invites")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "invites" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="w-3.5 h-3.5" /> My Invites
        </button>
        <button
          onClick={() => setTab("discover")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "discover" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className="w-3.5 h-3.5" /> Discover
        </button>
        <button
          onClick={() => setTab("transfers")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === "transfers" ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> Transfers
          {transfersIn.length > 0 && (
            <span className="ml-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">{transfersIn.length}</span>
          )}
        </button>
      </div>

      {tab === "invites" && !myPhone && <PhonePrompt onSaved={(p) => { setMyPhone(p); loadInvites(); }} />}

      {tab === "discover" ? (
        <DiscoverEvents />
      ) : tab === "transfers" ? (
        <div className="space-y-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Incoming</p>
            {transfersIn.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No pending transfers for you.</p>
            ) : (
              <div className="space-y-2">
                {transfersIn.map((t) => (
                  <div key={t.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <p className="text-sm font-semibold">{t.event_title || "Ticket"}</p>
                    <p className="text-xs text-muted-foreground">From {t.sender_name || t.sender_email}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" className="h-9 rounded-lg flex-1 gap-1" disabled={transferBusy === t.id} onClick={() => acceptTransfer(t)}>
                        <Check className="w-4 h-4" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 rounded-lg" disabled={transferBusy === t.id} onClick={() => declineTransfer(t)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Sent by you</p>
            {transfersOut.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">You haven't sent any transfers.</p>
            ) : (
              <div className="space-y-2">
                {transfersOut.map((t) => (
                  <div key={t.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <p className="text-sm font-semibold">{t.event_title || "Ticket"}</p>
                    <p className="text-xs text-muted-foreground">To {t.recipient_name || t.recipient_email} · waiting</p>
                    <Button size="sm" variant="outline" className="h-9 rounded-lg mt-2" disabled={transferBusy === t.id} onClick={() => cancelTransfer(t)}>
                      Cancel transfer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : loading ? (
        <LoadingSpinner />
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