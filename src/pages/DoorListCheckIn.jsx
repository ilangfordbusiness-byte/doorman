import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Search, Users, Check, Undo2, UserPlus, Share2, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Long lists render this many unchecked rows until the search narrows them.
const RENDER_CAP = 300;

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function statusTone(status) {
  const s = fold(status);
  if (!s) return "bg-secondary text-muted-foreground border-border";
  if (/going|approved|yes|attending/.test(s)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (/maybe|waitlist|pending/.test(s)) return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (/can.?t|not going|declin|^no\b/.test(s)) return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  if (/invited|walk/.test(s)) return "bg-sky-500/10 text-sky-300 border-sky-500/20";
  return "bg-secondary text-muted-foreground border-border";
}

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

// Search, add and check in the people on one door list. The owner and the
// people they've invited all see changes live (realtime). Access is decided
// by RLS: a list you can't open simply doesn't load.
export default function DoorListCheckIn() {
  const { id } = useParams();
  const { toast } = useToast();
  const me = /** @type {any} */ (useCurrentUser().data);
  const [list, setList] = useState(null);
  const [guests, setGuests] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.entities.DoorList.get(id),
      api.entities.DoorListGuest.filterAll({ list_id: id }, "name"),
      api.entities.DoorListMember.filter({ list_id: id }, "created_date"),
    ])
      .then(([l, g, m]) => { if (!cancelled) { setList(l); setGuests(g); setMembers(m); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    const unsubscribe = api.entities.DoorListGuest.subscribe(({ type, data }) => {
      if (!data?.id) return;
      setGuests((prev) => {
        if (type === "delete") return prev.filter((g) => g.id !== data.id);
        const i = prev.findIndex((g) => g.id === data.id);
        if (i === -1) return type === "create" ? [...prev, data] : prev;
        const next = prev.slice();
        next[i] = { ...prev[i], ...data };
        return next;
      });
    }, `list_id=eq.${id}`);
    return () => { cancelled = true; unsubscribe(); };
  }, [id]);

  const isOwner = !!list && list.owner_id === me?.id;

  // Plus-ones still outside, per host.
  const waitingPlusOnes = useMemo(() => {
    const m = {};
    for (const g of guests) {
      if (g.plus_one_of && !g.checked_in_at) (m[g.plus_one_of] ||= []).push(g);
    }
    return m;
  }, [guests]);

  const statuses = useMemo(() => {
    const counts = {};
    for (const g of guests) {
      const k = g.status || "No status";
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [guests]);

  const filtered = useMemo(() => {
    const tokens = fold(search).split(/\s+/).filter(Boolean);
    const digits = search.replace(/\D/g, "");
    return guests
      .filter((g) => statusFilter === "all" || (g.status || "No status") === statusFilter)
      .filter((g) => {
        if (!tokens.length) return true;
        const hay = fold(`${g.name} ${g.email || ""}`);
        if (tokens.every((t) => hay.includes(t))) return true;
        return digits.length >= 4 && String(g.phone || "").replace(/\D/g, "").includes(digits);
      })
      .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
  }, [guests, search, statusFilter]);

  const toCheckIn = filtered.filter((g) => !g.checked_in_at);
  const checkedIn = filtered.filter((g) => g.checked_in_at)
    .sort((a, b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at)));
  const peopleIn = guests.filter((g) => g.checked_in_at).length;
  const exactMatch = guests.some((g) => fold(g.name) === fold(search.trim()));

  if (loading) return <LoadingSpinner fullScreen />;
  if (!list) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 text-center">
        <p className="font-heading font-semibold">This list isn&apos;t available</p>
        <p className="text-sm text-muted-foreground mt-1 mb-3">It may have been deleted, or you haven&apos;t been invited to it with this account&apos;s email.</p>
        <Link to="/" className="text-sm text-primary">Go home</Link>
      </div>
    );
  }

  function patch(gid, fields) {
    setGuests((prev) => prev.map((g) => (g.id === gid ? { ...g, ...fields } : g)));
  }

  async function setCheckedIn(guest, checkedIn) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(guest.id);
    const prevAt = guest.checked_in_at;
    // Optimistic: the door moves fast; roll back if the write fails.
    patch(guest.id, { checked_in_at: checkedIn ? new Date().toISOString() : null });
    try {
      const res = await api.entities.DoorListGuest.setCheckedIn(guest.id, checkedIn);
      patch(guest.id, { checked_in_at: res?.checked_in_at ?? null });
      if (res?.already) {
        toast({ title: `${guest.name} was already checked in`, description: `at ${timeOf(res.checked_in_at)}` });
      } else if (checkedIn) {
        setSearch("");
      }
    } catch (e) {
      patch(guest.id, { checked_in_at: prevAt });
      toast({ title: "Couldn't update", description: e?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function checkInPlusOnes(host) {
    const waiting = waitingPlusOnes[host.id] || [];
    if (!waiting.length || busyRef.current) return;
    busyRef.current = true;
    setBusyId(host.id);
    try {
      const results = await Promise.all(waiting.map((p) => api.entities.DoorListGuest.setCheckedIn(p.id, true)));
      waiting.forEach((p, i) => patch(p.id, { checked_in_at: results[i]?.checked_in_at ?? new Date().toISOString() }));
    } catch (e) {
      toast({ title: "Couldn't check in their plus-ones", description: e?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function addPerson(checkInNow) {
    const name = search.trim();
    if (!name || busyRef.current) return;
    busyRef.current = true;
    try {
      const [created] = await api.entities.DoorListGuest.bulkCreate([
        { list_id: id, name, status: checkInNow ? "Walk-in" : "Added" },
      ]);
      let row = created;
      if (checkInNow) {
        const res = await api.entities.DoorListGuest.setCheckedIn(created.id, true);
        row = { ...created, checked_in_at: res?.checked_in_at };
      }
      setGuests((prev) => [...prev.filter((g) => g.id !== created.id), row]);
      setSearch("");
      toast({ title: checkInNow ? `${name} added and checked in` : `${name} added to the list` });
    } catch (e) {
      toast({ title: "Couldn't add", description: e?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
    }
  }

  async function invite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviting) return;
    setInviting(true);
    try {
      const res = await api.entities.DoorListMember.invite(id, email);
      setMembers(await api.entities.DoorListMember.filter({ list_id: id }, "created_date"));
      setInviteEmail("");
      toast({
        title: res?.resent ? "Invite sent again" : "Invite sent",
        description: res?.has_account ? `${email} can open the list now.` : `${email} gets access once they sign up with that email.`,
      });
    } catch (e) {
      toast({ title: "Couldn't invite", description: e?.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(m) {
    if (!window.confirm(`Remove ${m.email} from this list?`)) return;
    try {
      await api.entities.DoorListMember.delete(m.id);
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      toast({ title: "Couldn't remove them", variant: "destructive" });
    }
  }

  const row = (g) => {
    const waiting = waitingPlusOnes[g.id] || [];
    return (
      <div key={g.id} className={`flex items-center gap-3 rounded-xl border p-3 ${g.plus_one_of ? "ml-5" : ""} ${g.checked_in_at ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-border"}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-semibold truncate">{g.name}</p>
            {g.plus_ones > 0 && <span className="text-xs font-semibold text-primary flex-shrink-0">+{g.plus_ones}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {g.plus_one_of && <span className="text-[10px] px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">Plus-one</span>}
            {!g.plus_one_of && g.status && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusTone(g.status)}`}>{g.status}</span>}
            {g.checked_in_at && <span className="text-[11px] text-emerald-300">In at {timeOf(g.checked_in_at)}</span>}
            {!g.checked_in_at && g.phone && <span className="text-[11px] text-muted-foreground">{g.phone}</span>}
          </div>
        </div>
        {g.checked_in_at ? (
          <div className="flex items-center gap-1.5">
            {waiting.length > 0 && (
              <Button size="sm" className="h-10 rounded-lg px-3 bg-emerald-600 hover:bg-emerald-500" disabled={busyId === g.id}
                onClick={() => checkInPlusOnes(g)}>
                Check in +{waiting.length}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-10 rounded-lg gap-1.5" disabled={busyId === g.id}
              onClick={() => setCheckedIn(g, false)}>
              <Undo2 className="w-4 h-4" /> Undo
            </Button>
          </div>
        ) : (
          <Button className="h-11 rounded-lg gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-500" disabled={busyId === g.id}
            onClick={() => setCheckedIn(g, true)}>
            <Check className="w-4 h-4" /> Check in
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-3 bg-background/90 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-3">
          <Link to="/door-lists">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-bold text-lg truncate">{list.name}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-400" /> {peopleIn} of {guests.length} in
            </p>
          </div>
          {isOwner && (
            <Button variant="outline" size="sm" className="rounded-lg gap-1.5" onClick={() => setShareOpen((v) => !v)}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
          )}
        </div>

        {isOwner && shareOpen && (
          <div className="bg-card rounded-2xl border border-border p-3 mb-3 space-y-3">
            <p className="text-xs text-muted-foreground">People you invite can search this list, add people and check guests in. They sign in with the email you invite.</p>
            <div className="flex gap-2">
              <Input type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") invite(); }}
                placeholder="their@email.com" className="h-10 rounded-xl bg-secondary/50 border-border" />
              <Button className="h-10 rounded-xl gap-1.5" disabled={inviting || !inviteEmail.trim()} onClick={invite}>
                <Mail className="w-4 h-4" /> {inviting ? "Sending…" : "Invite"}
              </Button>
            </div>
            {members.length > 0 && (
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm bg-secondary/40 rounded-lg px-3 py-2">
                    <span className="flex-1 truncate">{m.email}</span>
                    <button type="button" aria-label={`Remove ${m.email}`} onClick={() => removeMember(m)}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="pl-10 h-12 rounded-xl bg-secondary/50 border-border text-base"
          />
        </div>

        {statuses.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto mt-3 -mx-4 px-4 scrollbar-none">
            {[["all", guests.length], ...statuses].map(([s, n]) => (
              <button key={s} type="button" onClick={() => setStatusFilter(String(s))}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                {s === "all" ? "All" : s} · {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-1 mt-2 mb-2">To check in ({toCheckIn.length})</p>
      <div className="space-y-2 mb-6">
        {toCheckIn.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{search ? "No matches." : "Everyone's in"}</p>
        ) : (
          toCheckIn.slice(0, RENDER_CAP).map(row)
        )}
        {toCheckIn.length > RENDER_CAP && (
          <p className="text-xs text-muted-foreground text-center py-2">Showing {RENDER_CAP} of {toCheckIn.length} — type a name to narrow it down.</p>
        )}
        {search.trim() && !exactMatch && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-11 rounded-xl gap-1.5" onClick={() => addPerson(false)}>
              <UserPlus className="w-4 h-4" /> Add to list
            </Button>
            <Button className="flex-1 h-11 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-500" onClick={() => addPerson(true)}>
              <Check className="w-4 h-4" /> Add &amp; check in
            </Button>
          </div>
        )}
      </div>

      {checkedIn.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold px-1 mb-2">Checked in ({checkedIn.length})</p>
          <div className="space-y-2">{checkedIn.map(row)}</div>
        </>
      )}
    </div>
  );
}
