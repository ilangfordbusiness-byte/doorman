import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/data";
import { UserPlus, Ticket, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// Renders the primary join action for a guest on an event page:
//  - paid event        → "Buy Tickets"
//  - free + public     → "Join" (instant, adds to attendee list)
//  - free + private    → "Request to Join" (or a disabled state if declined)
// Active entries (approved/invited/checked_in/requested) render nothing here;
// the parent shows the status / pass in that case.
export default function EventJoinActions({ event, me, myEntry, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!me || !event) return null;

  const isPaid = !!event.is_paid;
  const isPublic = !!event.is_public;
  const status = myEntry?.status;
  const active = status && ["approved", "invited", "checked_in", "requested"].includes(status);

  async function joinPublic() {
    setBusy(true);
    try {
      const qr_secret = crypto.randomUUID();
      if (myEntry && myEntry.status === "denied") {
        await api.entities.GuestlistEntry.update(myEntry.id, { status: "approved", source: "invite_link", qr_secret });
      } else {
        await api.entities.GuestlistEntry.create({
          event_id: event.id,
          guest_email: me.email,
          guest_name: me.full_name,
          guest_phone: me.phone || "",
          status: "approved",
          source: "invite_link",
          qr_secret,
        });
      }
      toast({ title: "You're on the list!" });
      onChanged?.();
    } catch (e) {
      toast({ title: e?.message || "Something went wrong", variant: "destructive" });
    }
    setBusy(false);
  }

  async function requestPrivate() {
    setBusy(true);
    try {
      const qr_secret = crypto.randomUUID();
      await api.entities.GuestlistEntry.create({
        event_id: event.id,
        guest_email: me.email,
        guest_name: me.full_name,
        guest_phone: me.phone || "",
        status: "requested",
        source: "invite_link",
        qr_secret,
      });
      toast({ title: "Request sent!" });
      onChanged?.();
    } catch (e) {
      toast({ title: e?.message || "Something went wrong", variant: "destructive" });
    }
    setBusy(false);
  }

  if (isPaid) {
    if (active) return null;
    return (
      <Link to={`/event/${event.id}/checkout`} className="block">
        <Button className="w-full h-14 rounded-xl font-bold text-base gap-2 bg-primary hover:bg-primary/90">
          <Ticket className="w-5 h-5" /> Buy Tickets
        </Button>
      </Link>
    );
  }

  // free event
  if (active) return null;

  if (!isPublic && status === "denied") {
    return (
      <div className="space-y-2">
        <Button disabled className="w-full h-14 rounded-xl font-bold text-base gap-2 opacity-60">
          <Lock className="w-5 h-5" /> Request to Join
        </Button>
        <p className="text-xs text-center text-muted-foreground">You're not able to request to join this event.</p>
      </div>
    );
  }

  if (isPublic) {
    return (
      <Button className="w-full h-14 rounded-xl font-bold text-base gap-2 bg-primary hover:bg-primary/90" onClick={joinPublic} disabled={busy}>
        <UserPlus className="w-5 h-5" /> {busy ? "Joining..." : "Join"}
      </Button>
    );
  }

  return (
    <Button className="w-full h-14 rounded-xl font-bold text-base gap-2 bg-primary hover:bg-primary/90" onClick={requestPrivate} disabled={busy}>
      <UserPlus className="w-5 h-5" /> {busy ? "Requesting..." : "Request to Join"}
    </Button>
  );
}