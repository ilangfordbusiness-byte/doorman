import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { ArrowLeft, Search, Users, Check, Undo2, UserPlus, Share2, X, Mail, Trash2, Pencil, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import SlidingTabs from "@/components/SlidingTabs";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Long lists render this many rows until the search narrows them.
const RENDER_CAP = 300;
const MAX_ADD_PLUS_ONES = 10;

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function statusTone(status) {
  const s = fold(status);
  if (!s) return "bg-secondary text-muted-foreground border-border";
  if (/going|approved|yes|attending/.test(s)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (/maybe|waitlist|pending/.test(s)) return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (/can.?t|not going|declin|^no\b/.test(s)) return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  if (/invited|walk|added/.test(s)) return "bg-sky-500/10 text-sky-300 border-sky-500/20";
  return "bg-secondary text-muted-foreground border-border";
}

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

// Search, add, remove and check in the people on one door list. The owner and
// the people they've invited all see changes live (realtime). Access is
// decided by RLS: a list you can't open simply doesn't load.
export default function DoorListCheckIn() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const me = /** @type {any} */ (useCurrentUser().data);
  const [list, setList] = useState(null);
  const [guests, setGuests] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("out"); // "out" = still to check in, "in" = checked in
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [panel, setPanel] = useState(null); // null | "share" | "add"
  const [editing, setEditing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlusOnes, setNewPlusOnes] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.entities.DoorList.get(id),
      api.entities.DoorListGuest.filterAll({ list_id: id }, "name"),
    ])
      .then(([l, g]) => { if (!cancelled) { setList(l); setGuests(g); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Members only feed the owner's Share panel; never let them block the list.
    api.entities.DoorListMember.filter({ list_id: id }, "created_date")
      .then((m) => { if (!cancelled) setMembers(m); })
      .catch(() => {});

    const removeLocal = (gid) => setGuests((prev) => (prev.some((g) => g.id === gid)
      ? prev.filter((g) => g.id !== gid && g.plus_one_of !== gid)
      : prev));
    const unsubscribe = api.entities.DoorListGuest.subscribe(({ type, data }) => {
      if (!data?.id) return;
      if (type === "delete") { removeLocal(data.id); return; }
      setGuests((prev) => {
        const i = prev.findIndex((g) => g.id === data.id);
        if (i === -1) return type === "create" ? [...prev, data] : prev;
        const next = prev.slice();
        next[i] = { ...prev[i], ...data };
        return next;
      });
    }, `list_id=eq.${id}`);
    // Deletes can't be filtered by list, so they arrive on their own channel.
    const unsubscribeDeletes = api.entities.DoorListGuest.subscribeDeletes(removeLocal);
    return () => { cancelled = true; unsubscribe(); unsubscribeDeletes(); };
  }, [id]);

  const isOwner = !!list && list.owner_id === me?.id;

  // An invitee opening the list clears it from their notifications.
  useEffect(() => {
    if (!list || !me?.id || list.owner_id === me.id) return;
    api.entities.DoorListMember.markOpened(list.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => {});
  }, [list?.id, me?.id]);

  const byId = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

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

  const { outRows, inRows, outCount, inCount } = useMemo(() => {
    const tokens = fold(search).split(/\s+/).filter(Boolean);
    const digits = search.replace(/\D/g, "");
    const byStatus = guests.filter((g) => statusFilter === "all" || (g.status || "No status") === statusFilter);
    const matches = (g) => {
      if (!tokens.length) return true;
      const hay = fold(`${g.name} ${g.email || ""}`);
      if (tokens.every((t) => hay.includes(t))) return true;
      return digits.length >= 4 && String(g.phone || "").replace(/\D/g, "").includes(digits);
    };
    const out = byStatus.filter((g) => !g.checked_in_at);
    const inn = byStatus.filter((g) => g.checked_in_at);
    // Still outside: alphabetical, each plus-one tucked under its host.
    const outIds = new Set(out.map((g) => g.id));
    const sortKey = (g) => (g.plus_one_of && outIds.has(g.plus_one_of)
      ? `${fold(byId.get(g.plus_one_of)?.name)}\u0001${fold(g.name)}`
      : fold(g.name));
    return {
      outCount: out.length,
      inCount: inn.length,
      outRows: out.filter(matches).sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
      // Checked in: most recent first, so a mistake is right at the top.
      inRows: inn.filter(matches).sort((a, b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at))),
    };
  }, [guests, search, statusFilter, byId]);

  const rows = tab === "out" ? outRows : inRows;
  const otherMatches = search.trim() ? (tab === "out" ? inRows : outRows).length : 0;
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

  // Add someone by hand (plus any plus-ones), optionally checking them all in.
  async function addPerson(rawName, plusOnes, checkInNow) {
    const name = rawName.replace(/\s+/g, " ").trim();
    if (!name || busyRef.current) return;
    busyRef.current = true;
    try {
      const status = checkInNow ? "Walk-in" : "Added";
      const [host] = await api.entities.DoorListGuest.bulkCreate([{ list_id: id, name, status }]);
      const extras = plusOnes > 0
        ? await api.entities.DoorListGuest.bulkCreate(Array.from({ length: plusOnes }, (_, i) => ({
            list_id: id, name: `${name} +${i + 1}`, status, plus_one_of: host.id,
          })))
        : [];
      let added = [host, ...extras];
      if (checkInNow) {
        const results = await Promise.all(added.map((g) => api.entities.DoorListGuest.setCheckedIn(g.id, true)));
        added = added.map((g, i) => ({ ...g, checked_in_at: results[i]?.checked_in_at ?? new Date().toISOString() }));
      }
      const ids = new Set(added.map((g) => g.id));
      setGuests((prev) => [...prev.filter((g) => !ids.has(g.id)), ...added]);
      setSearch("");
      setNewName("");
      setNewPlusOnes(0);
      setPanel(null);
      const who = plusOnes > 0 ? `${name} +${plusOnes}` : name;
      toast({ title: checkInNow ? `${who} added and checked in` : `${who} added to the list` });
    } catch (e) {
      toast({ title: "Couldn't add", description: e?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
    }
  }

  async function removeGuest(g) {
    const kids = guests.filter((x) => x.plus_one_of === g.id);
    const msg = kids.length
      ? `Remove ${g.name} and their ${kids.length} plus-one${kids.length > 1 ? "s" : ""} from the list?`
      : `Remove ${g.name} from the list?`;
    if (busyRef.current || !window.confirm(msg)) return;
    busyRef.current = true;
    setBusyId(g.id);
    try {
      await api.entities.DoorListGuest.delete(g.id); // plus-ones go with them (on delete cascade)
      setGuests((prev) => prev.filter((x) => x.id !== g.id && x.plus_one_of !== g.id));
      toast({ title: `${g.name} removed` });
    } catch (e) {
      toast({ title: "Couldn't remove them", description: e?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function invite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviting) return;
    setInviting(true);
    try {
      const res = await api.entities.DoorListMember.invite(id, email);
      setMembers(await api.entities.DoorListMember.filter({ list_id: id }, "created_date").catch(() => members));
      setInviteEmail("");
      toast({
        title: res?.resent ? "Invite sent again" : "Invite sent",
        description: res?.has_account
          ? `${email} can open the list now. It's in their Activity.`
          : `${email} gets access once they sign up with that email.`,
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

  function toggleAdd() {
    setNewName(exactMatch ? "" : search.trim());
    setNewPlusOnes(0);
    setPanel((p) => (p === "add" ? null : "add"));
  }

  const row = (g, i) => {
    const waiting = waitingPlusOnes[g.id] || [];
    const host = g.plus_one_of ? byId.get(g.plus_one_of) : null;
    const prev = rows[i - 1];
    const tucked = tab === "out" && !!host && !!prev && (prev.id === host.id || prev.plus_one_of === host.id);
    const busy = busyId === g.id;
    return (
      <div key={g.id} className={`flex items-center gap-3 rounded-xl border p-3 ${tucked ? "ml-5" : ""} ${g.checked_in_at ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-border"}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-semibold truncate">{g.name}</p>
            {g.plus_ones > 0 && <span className="text-xs font-semibold text-primary flex-shrink-0">+{g.plus_ones}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {g.plus_one_of && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 truncate max-w-[12rem]">
                {host && !tucked ? `Plus-one of ${host.name}` : "Plus-one"}
              </span>
            )}
            {!g.plus_one_of && g.status && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusTone(g.status)}`}>{g.status}</span>}
            {g.checked_in_at && <span className="text-[11px] text-emerald-300">In at {timeOf(g.checked_in_at)}</span>}
            {!g.checked_in_at && g.phone && <span className="text-[11px] text-muted-foreground">{g.phone}</span>}
          </div>
        </div>
        {editing ? (
          <Button variant="outline" size="sm" className="h-10 rounded-lg gap-1.5 text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
            disabled={busy} onClick={() => removeGuest(g)}>
            <Trash2 className="w-4 h-4" /> Remove
          </Button>
        ) : g.checked_in_at ? (
          <div className="flex items-center gap-1.5">
            {waiting.length > 0 && (
              <Button size="sm" className="h-10 rounded-lg px-3 bg-emerald-600 hover:bg-emerald-500" disabled={busy}
                onClick={() => checkInPlusOnes(g)}>
                Check in +{waiting.length}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-10 rounded-lg gap-1.5" disabled={busy}
              onClick={() => setCheckedIn(g, false)}>
              <Undo2 className="w-4 h-4" /> Undo
            </Button>
          </div>
        ) : (
          <Button className="h-11 rounded-lg gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-500" disabled={busy}
            onClick={() => setCheckedIn(g, true)}>
            <Check className="w-4 h-4" /> Check in
          </Button>
        )}
      </div>
    );
  };

  const tabs = [
    { id: "out", label: `To check in · ${outCount}` },
    { id: "in", label: `Checked in · ${inCount}` },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-3 bg-background/90 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
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
          <Button size="sm" className="rounded-lg gap-1.5" variant={panel === "add" ? "secondary" : "default"} onClick={toggleAdd}>
            <UserPlus className="w-4 h-4" /> Add
          </Button>
          {isOwner && (
            <Button variant={panel === "share" ? "secondary" : "outline"} size="sm" className="rounded-lg" aria-label="Share"
              onClick={() => setPanel((p) => (p === "share" ? null : "share"))}>
              <Share2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant={editing ? "secondary" : "outline"} size="sm" className="rounded-lg"
            aria-label={editing ? "Done editing" : "Edit list"} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : <Pencil className="w-4 h-4" />}
          </Button>
        </div>

        {panel === "add" && (
          <div className="bg-card rounded-2xl border border-border p-3 mb-3 space-y-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") addPerson(newName, newPlusOnes, false); }}
              placeholder="Their name" autoComplete="off" autoCorrect="off" spellCheck={false}
              className="h-11 rounded-xl bg-secondary/50 border-border text-base" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plus-ones</span>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="Fewer plus-ones"
                  disabled={newPlusOnes === 0} onClick={() => setNewPlusOnes((n) => Math.max(0, n - 1))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-5 text-center font-semibold tabular-nums">{newPlusOnes}</span>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label="More plus-ones"
                  disabled={newPlusOnes >= MAX_ADD_PLUS_ONES} onClick={() => setNewPlusOnes((n) => Math.min(MAX_ADD_PLUS_ONES, n + 1))}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl gap-1.5" disabled={!newName.trim()}
                onClick={() => addPerson(newName, newPlusOnes, false)}>
                <UserPlus className="w-4 h-4" /> Add to list
              </Button>
              <Button className="flex-1 h-11 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-500" disabled={!newName.trim()}
                onClick={() => addPerson(newName, newPlusOnes, true)}>
                <Check className="w-4 h-4" /> Add &amp; check in
              </Button>
            </div>
          </div>
        )}

        {isOwner && panel === "share" && (
          <div className="bg-card rounded-2xl border border-border p-3 mb-3 space-y-3">
            <p className="text-xs text-muted-foreground">People you invite can search this list, add and remove people, and check guests in. It shows up in their Activity tab. They sign in with the email you invite.</p>
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
                    <span className={`text-[10px] flex-shrink-0 ${m.opened_at ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {m.opened_at ? "Joined" : "Invited"}
                    </span>
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

        <SlidingTabs className="mb-3" tabs={tabs} value={tab} onChange={(t) => setTab(String(t))} />

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

      {editing && (
        <p className="text-xs text-rose-300/90 bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2 mt-2">
          Tap Remove to take someone off the list for everyone. Tap Done when you&apos;re finished.
        </p>
      )}

      <div className="space-y-2 mt-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {search ? "No matches here." : tab === "out" ? "Everyone's in" : "No one's checked in yet"}
          </p>
        ) : (
          rows.slice(0, RENDER_CAP).map(row)
        )}
        {rows.length > RENDER_CAP && (
          <p className="text-xs text-muted-foreground text-center py-2">Showing {RENDER_CAP} of {rows.length}. Type a name to narrow it down.</p>
        )}
        {otherMatches > 0 && (
          <button type="button" onClick={() => setTab(tab === "out" ? "in" : "out")}
            className="w-full text-sm text-primary py-2">
            {otherMatches} {otherMatches === 1 ? "match" : "matches"} in {tab === "out" ? "Checked in" : "To check in"} →
          </button>
        )}
        {search.trim() && !exactMatch && !editing && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-11 rounded-xl gap-1.5 min-w-0" onClick={() => addPerson(search, 0, false)}>
              <UserPlus className="w-4 h-4 flex-shrink-0" /> <span className="truncate">Add &quot;{search.trim()}&quot;</span>
            </Button>
            <Button className="flex-1 h-11 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-500" onClick={() => addPerson(search, 0, true)}>
              <Check className="w-4 h-4" /> Add &amp; check in
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
