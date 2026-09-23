import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Search, QrCode, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import GuestCard from "../components/GuestCard";
import LoadingSpinner from "../components/LoadingSpinner";
import { useProfiles } from "@/hooks/useProfiles";
import { normalizePhone } from "@/lib/phone";

// Focused door tool for staff and managers: read the guestlist by name and
// check people in (or undo). Check-in only — no approve/deny/add — so it's safe
// to expose to door staff. Data access + the check-in write are authorized
// server-side (RLS + validateQR); this page adds a friendly access gate.
export default function DoorList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const { data: profiles } = useProfiles(guests.map((g) => g.guest_email).filter(Boolean));

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [events, entries, me] = await Promise.all([
        api.entities.Event.filter({ id }),
        api.entities.GuestlistEntry.filter({ event_id: id }, "guest_name"),
        api.auth.me().catch(() => null),
      ]);
      const ev = events[0] || null;
      setEvent(ev);
      setGuests(entries);

      // Access gate: host, accepted co-host, business manager, or event staff.
      if (ev && me) {
        const email = me.email?.toLowerCase();
        let ok = ev.host_email?.toLowerCase() === email
          || (ev.co_host_emails || []).map((e) => e.toLowerCase()).includes(email);
        if (!ok && ev.business_id) {
          const mine = await api.businesses.mine(me.email).catch(() => []);
          ok = mine.some((b) => b.id === ev.business_id);
        }
        if (!ok) {
          const staffRows = await api.entities.EventStaff.filter({ staff_email: me.email }).catch(() => []);
          ok = staffRows.some((s) => s.event_id === id);
        }
        setAuthorized(ok);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Check a guest in (or undo) by name via the atomic, authorized validateQR path.
  async function checkIn(guest, undo = false) {
    try {
      const { data } = await api.functions.invoke("validateQR", {
        guestlist_entry_id: guest.id,
        action: undo ? "uncheck" : "check_in",
      });
      if (data?.valid === false && !data?.already_used) throw new Error(data.error || "Check-in failed");
      toast({ title: undo ? "Check-in undone" : data?.already_used ? "Already checked in" : `${guest.guest_name || "Guest"} checked in` });
    } catch (e) {
      toast({ title: e?.message || "Check-in failed", variant: "destructive" });
    }
    loadData();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    const digits = normalizePhone(q) || q.replace(/\D/g, "");
    return guests.filter((g) =>
      (g.guest_name || "").toLowerCase().includes(q)
      || (g.guest_email || "").toLowerCase().includes(q)
      || (digits && (g.guest_phone || "").includes(digits)));
  }, [guests, search]);

  const toCheckIn = filtered.filter((g) => ["approved", "invited"].includes(g.status));
  const checkedIn = filtered.filter((g) => g.status === "checked_in");
  const admittedTotal = guests.filter((g) => ["approved", "invited", "checked_in"].includes(g.status)).length;
  const inCount = guests.filter((g) => g.status === "checked_in").length;

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-lg truncate">{event?.title || "Door list"}</h1>
          <p className="text-xs text-muted-foreground">Check guests in by name</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-lg gap-1.5" onClick={() => navigate(`/scanner?event_id=${id}`)}>
          <QrCode className="w-4 h-4" /> Scan
        </Button>
      </div>

      {!authorized ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <p className="font-heading font-semibold mb-1">You don&apos;t have access</p>
          <p className="text-sm text-muted-foreground">Only the event&apos;s host, co-hosts and door staff can open this list. Ask the host to add you with the staff code.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4 mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium">Checked in</span>
            </div>
            <span className="font-heading font-bold text-lg">
              {inCount} <span className="text-muted-foreground font-normal text-sm">/ {event?.capacity ? `${admittedTotal} · cap ${event.capacity}` : admittedTotal}</span>
            </span>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone..."
              className="pl-10 h-11 rounded-xl bg-secondary/50 border-border"
            />
          </div>

          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-1 mb-2">To check in ({toCheckIn.length})</p>
          <div className="space-y-2 mb-6">
            {toCheckIn.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{search ? "No matches." : "Everyone's in 🎉"}</p>
            ) : (
              toCheckIn.map((g) => (
                <GuestCard key={g.id} guest={g} picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                  onCheckIn={(g) => checkIn(g)} showActions />
              ))
            )}
          </div>

          {checkedIn.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-1 mb-2">Checked in ({checkedIn.length})</p>
              <div className="space-y-2">
                {checkedIn.map((g) => (
                  <GuestCard key={g.id} guest={g} picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                    onUncheck={(g) => checkIn(g, true)} showActions />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
