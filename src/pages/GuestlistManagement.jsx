import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import {
  ArrowLeft, Search, UserPlus, Download, Check, X, Clock, RotateCcw, ChevronRight, User,
} from "lucide-react";
import { buildGuestlistCsv } from "@/lib/eventExport";
import { downloadCsv, slugForFilename } from "@/lib/csv";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import SlidingTabs from "@/components/SlidingTabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import LoadingSpinner from "../components/LoadingSpinner";
import Avatar from "../components/Avatar";
import { useProfiles } from "@/hooks/useProfiles";
import PhoneInput from "@/components/PhoneInput";
import { normalizePhone, formatPhoneDisplay } from "@/lib/phone";
import FriendProfile from "../components/FriendProfile";

// Tinted icon chip per action tone, used in the per-guest action sheet.
const TONE = {
  approve: "bg-emerald-500/15 text-emerald-400",
  wait: "bg-amber-500/15 text-amber-400",
  deny: "bg-red-500/15 text-red-400",
  muted: "bg-secondary text-muted-foreground",
};

export default function GuestlistManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [glTab, setGlTab] = useState(null);
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newGuest, setNewGuest] = useState({ name: "", email: "", phone: "" });
  const [adding, setAdding] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const csvRef = useRef(null);
  const [friends, setFriends] = useState([]);
  const [me, setMe] = useState(null);
  const [viewProfile, setViewProfile] = useState(null);
  // Guest whose pass is about to be revoked; set by the action sheet, cleared by the confirm dialog.
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [plusOneTarget, setPlusOneTarget] = useState(null);
  const [plusOneName, setPlusOneName] = useState("");
  const [savingPlusOne, setSavingPlusOne] = useState(false);
  // The guest whose action sheet (bottom drawer) is open.
  const [actionTarget, setActionTarget] = useState(null);
  // Multi-select / bulk actions.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Per-row in-flight lock so a fast double-tap can't fire the same action twice
  // (e.g. approving a guest sends ONE ticket email). Ref = synchronous guard.
  const busyRef = useRef(new Set());
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const markBusy = (key, on) => {
    if (on) busyRef.current.add(key);
    else busyRef.current.delete(key);
    setBusyKeys(new Set(busyRef.current));
  };
  const { data: profiles } = useProfiles(guests.map((g) => g.guest_email).filter(Boolean));

  useEffect(() => {
    loadData();
    loadFriends();
  }, [id]);

  async function loadFriends() {
    try {
      const user = await api.auth.me();
      setMe(user);
      const sent = await api.entities.FriendRequest.filter({ sender_email: user.email, status: "accepted" });
      const received = await api.entities.FriendRequest.filter({ receiver_email: user.email, status: "accepted" });
      const friendList = [
        ...sent.map((r) => ({ name: r.receiver_name, email: r.receiver_email, picture: r.receiver_picture })),
        ...received.map((r) => ({ name: r.sender_name, email: r.sender_email, picture: r.sender_picture })),
      ];
      setFriends(friendList);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadData() {
    try {
      const events = await api.entities.Event.filter({ id });
      if (events.length) setEvent(events[0]);
      const entries = await api.entities.GuestlistEntry.filterAll({ event_id: id }, "-created_date");
      setGuests(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(guest, status) {
    if (busyRef.current.has(guest.id)) return;
    markBusy(guest.id, true);
    try {
      const updates = { status };
      if (status === "approved" && !guest.qr_secret) {
        updates.qr_secret = crypto.randomUUID();
      }
      await api.entities.GuestlistEntry.update(guest.id, updates);
      const statusLabel = { waitlist: "moved to waitlist", approved: "approved", denied: "removed", revoked: "revoked" }[status] || status;
      toast({ title: `Guest ${statusLabel}` });
      // Email the guest their free ticket (QR + pass link) once approved.
      if (status === "approved" && guest.guest_email && !event?.is_paid) {
        api.functions.invoke("sendTicketEmail", { entry_id: guest.id }).catch(() => {});
      }
      await loadData();
    } finally {
      markBusy(guest.id, false);
    }
  }

  // A guest's +1 is captured with the plus-one's name so it shows under the
  // guest on the list, on their pass, and at the door. The guest stays a single
  // entry (one person) that carries the +1; validateQR gates the door reveal on
  // event.plus_one_allowed too.
  function openPlusOne(guest) {
    setPlusOneTarget(guest);
    setPlusOneName(guest.plus_one_name || "");
  }

  async function savePlusOne() {
    if (!plusOneTarget || savingPlusOne) return;
    setSavingPlusOne(true);
    try {
      await api.entities.GuestlistEntry.update(plusOneTarget.id, {
        plus_one: true,
        plus_one_name: plusOneName.trim() || null,
      });
      toast({ title: "Plus-one saved" });
      setPlusOneTarget(null);
      loadData();
    } catch (e) {
      toast({ title: e?.message || "Couldn't save plus-one", variant: "destructive" });
    } finally {
      setSavingPlusOne(false);
    }
  }

  async function removePlusOne() {
    if (!plusOneTarget || savingPlusOne) return;
    setSavingPlusOne(true);
    try {
      await api.entities.GuestlistEntry.update(plusOneTarget.id, { plus_one: false, plus_one_name: null });
      toast({ title: "Plus-one removed" });
      setPlusOneTarget(null);
      loadData();
    } catch (e) {
      toast({ title: e?.message || "Couldn't remove plus-one", variant: "destructive" });
    } finally {
      setSavingPlusOne(false);
    }
  }

  // Revoking kills a working pass, so it only fires after the host confirms in the dialog.
  async function confirmRevoke() {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    try {
      await updateStatus(revokeTarget, "revoked");
      setRevokeTarget(null);
    } catch (e) {
      toast({ title: e?.message || "Could not revoke pass", variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  }

  // Check a guest in (or undo) by name via the atomic, authorized validateQR path.
  async function checkIn(guest, undo = false) {
    if (busyRef.current.has(guest.id)) return;
    markBusy(guest.id, true);
    try {
      const { data } = await api.functions.invoke("validateQR", {
        guestlist_entry_id: guest.id,
        action: undo ? "uncheck" : "check_in",
      });
      if (data?.valid === false && !data?.already_used) throw new Error(data.error || "Check-in failed");
      toast({ title: undo ? "Check-in undone" : data?.already_used ? "Already checked in" : "Checked in" });
      await loadData();
    } catch (e) {
      toast({ title: e?.message || "Check-in failed", variant: "destructive" });
    } finally {
      markBusy(guest.id, false);
    }
  }

  async function addFriendToGuestlist(friend) {
    if (busyRef.current.has(friend.email)) return;
    const existing = guests.find((g) => g.guest_email === friend.email);
    if (existing) {
      toast({ title: "Already on guestlist", variant: "destructive" });
      return;
    }
    markBusy(friend.email, true);
    try {
      await api.entities.GuestlistEntry.create({
        event_id: id,
        guest_email: friend.email,
        guest_name: friend.name,
        guest_phone: "",
        status: "invited",
        source: "manual",
        qr_secret: crypto.randomUUID(),
      });
      toast({ title: `${friend.name} invited!` });
      await loadData();
    } finally {
      markBusy(friend.email, false);
    }
  }

  async function addGuest() {
    if (!newGuest.email && !newGuest.phone) {
      toast({ title: "Email or phone required", variant: "destructive" });
      return;
    }
    setAdding(true);

    const email = newGuest.email.trim().toLowerCase();
    const phone = normalizePhone(newGuest.phone);
    const existing = guests.find(
      (g) =>
        (email && (g.guest_email || "").toLowerCase() === email) ||
        (phone && normalizePhone(g.guest_phone || "") === phone)
    );
    if (existing) {
      toast({ title: "Guest already on list", variant: "destructive" });
      setAdding(false);
      return;
    }

    await api.entities.GuestlistEntry.create({
      event_id: id,
      guest_email: email,
      guest_name: newGuest.name,
      guest_phone: phone,
      status: "invited",
      source: "manual",
      qr_secret: crypto.randomUUID(),
    });

    toast({ title: "Guest added!" });
    setNewGuest({ name: "", email: "", phone: "" });
    setAddOpen(false);
    setAdding(false);
    loadData();
  }

  // Parse pasted/CSV lines into {name, email}. A line is "Name, email", just an
  // email, or just a name; the email is whichever column contains an "@".
  function parseGuestLines(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const cols = line.split(/[,\t;]/).map((c) => c.trim()).filter(Boolean);
      const email = (cols.find((c) => c.includes("@")) || "").toLowerCase();
      const name = cols.find((c) => !c.includes("@")) || (email ? email.split("@")[0] : "");
      return { name, email };
    });
  }

  async function importGuests(parsed) {
    if (importing) return;
    // Dedupe within the batch and against the current list (by email); keep
    // email-less rows (a name-only door entry) since they can't collide.
    const have = new Set(guests.map((g) => (g.guest_email || "").toLowerCase()).filter(Boolean));
    const seen = new Set();
    const rows = [];
    for (const r of parsed) {
      if (r.email) {
        if (have.has(r.email) || seen.has(r.email)) continue;
        seen.add(r.email);
      } else if (!r.name) {
        continue;
      }
      rows.push({
        event_id: id,
        guest_email: r.email,
        guest_name: r.name,
        guest_phone: "",
        status: "invited",
        source: "manual",
        qr_secret: crypto.randomUUID(),
      });
    }
    if (!rows.length) {
      toast({ title: "No new guests to add", description: "They were blank or already on the list.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      await api.entities.GuestlistEntry.bulkCreate(rows);
      const skipped = parsed.length - rows.length;
      toast({
        title: `${rows.length} added to the guestlist`,
        description: skipped > 0 ? `${skipped} skipped (blank or already on the list)` : undefined,
      });
      setImportText("");
      setAddOpen(false);
      await loadData();
    } catch (e) {
      toast({ title: e?.message || "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  function onCsvFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // Drop a header row like "name,email" (no @, mentions a column name).
      if (lines.length && !lines[0].includes("@") && /name|email|guest/i.test(lines[0])) lines.shift();
      importGuests(parseGuestLines(lines.join("\n")));
    };
    reader.onerror = () => toast({ title: "Couldn't read that file", variant: "destructive" });
    reader.readAsText(file);
  }

  async function exportCsv() {
    const day = new Date().toISOString().slice(0, 10);
    try {
      await downloadCsv(`${slugForFilename(event?.title)}-guestlist-${day}.csv`, buildGuestlistCsv({ guests }));
    } catch (e) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  }

  // ---- selection / bulk ----
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const toggleSel = (g) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
    return next;
  });
  async function bulkApply(status) {
    if (bulkBusy || selected.size === 0) return;
    setBulkBusy(true);
    const targets = guests.filter((g) => selected.has(g.id));
    try {
      for (const g of targets) {
        const updates = { status };
        if (status === "approved" && !g.qr_secret) updates.qr_secret = crypto.randomUUID();
        await api.entities.GuestlistEntry.update(g.id, updates);
        if (status === "approved" && g.guest_email && !event?.is_paid) {
          api.functions.invoke("sendTicketEmail", { entry_id: g.id }).catch(() => {});
        }
      }
      const label = { approved: "approved", waitlist: "moved to waitlist", denied: "removed" }[status] || status;
      toast({ title: `${targets.length} guest${targets.length === 1 ? "" : "s"} ${label}` });
      exitSelect();
      await loadData();
    } catch (e) {
      toast({ title: e?.message || "Bulk action failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  // ---- per-guest action sheet ----
  // Close the sheet, then run the action (a short defer lets the drawer finish
  // closing before another dialog — plus-one / revoke — opens over it).
  function runAction(fn) {
    setActionTarget(null);
    setTimeout(fn, 160);
  }
  function actionsFor(g) {
    const a = [];
    if (["requested", "waitlist", "denied", "revoked"].includes(g.status)) {
      const reapprove = g.status === "denied" || g.status === "revoked";
      a.push({ key: "approve", label: reapprove ? "Re-approve" : "Approve", tone: "approve", Icon: Check, run: () => updateStatus(g, "approved") });
    }
    if (["approved", "invited"].includes(g.status)) {
      a.push({ key: "checkin", label: "Check in", tone: "approve", Icon: Check, run: () => checkIn(g) });
    }
    if (g.status === "checked_in") {
      a.push({ key: "undo", label: "Undo check-in", tone: "muted", Icon: RotateCcw, run: () => checkIn(g, true) });
    }
    if (["requested", "approved", "invited"].includes(g.status)) {
      a.push({ key: "waitlist", label: "Move to waitlist", tone: "wait", Icon: Clock, run: () => updateStatus(g, "waitlist") });
    }
    if (event?.plus_one_allowed && g.status !== "checked_in") {
      a.push({ key: "plus", label: g.plus_one ? "Edit plus-one" : "Add a plus-one", tone: "muted", Icon: UserPlus, run: () => openPlusOne(g) });
    }
    a.push({ key: "profile", label: "View profile", tone: "muted", Icon: User, run: () => setViewProfile(g) });
    if (["requested", "waitlist"].includes(g.status)) {
      a.push({ key: "deny", label: "Remove", tone: "deny", Icon: X, run: () => updateStatus(g, "denied") });
    } else if (["approved", "invited"].includes(g.status)) {
      a.push({ key: "revoke", label: "Revoke pass", tone: "deny", Icon: X, run: () => setRevokeTarget(g) });
    }
    return a;
  }

  const filtered = guests.filter((g) => {
    const q = search.toLowerCase();
    // Digits-only match lets "07700" find a stored "+447700…".
    const qDigits = q.replace(/\D/g, "").replace(/^0/, "");
    return (
      (g.guest_name || "").toLowerCase().includes(q) ||
      (g.guest_email || "").toLowerCase().includes(q) ||
      (g.guest_phone || "").includes(q) ||
      (qDigits && (g.guest_phone || "").replace(/\D/g, "").includes(qDigits))
    );
  });

  const byStatus = (status) => filtered.filter((g) => g.status === status);
  const requests = byStatus("requested");
  const approved = [...byStatus("approved"), ...byStatus("invited")];
  const checkedIn = byStatus("checked_in");
  const denied = [...byStatus("denied"), ...byStatus("revoked")];
  const waitlist = byStatus("waitlist");
  // Default to Requests when any are pending, else Approved — until the user taps a tab.
  const activeTab = glTab ?? (requests.length > 0 ? "requests" : "approved");

  // Capacity header (counts the whole list, not the search filter).
  const admitted = guests.filter((g) => ["approved", "invited", "checked_in"].includes(g.status)).length;
  const pending = guests.filter((g) => g.status === "requested").length;
  const capacity = event?.capacity || null;

  if (loading) return <LoadingSpinner fullScreen />;

  const rowProps = (g) => ({
    guest: g,
    picture: profiles?.[g.guest_email?.toLowerCase()]?.picture,
    selectMode,
    selected: selected.has(g.id),
    onOpen: setActionTarget,
    onToggle: toggleSel,
  });
  const swipeApprove = (g) => updateStatus(g, "approved");
  const swipeDeny = (g) => updateStatus(g, "denied");

  return (
    <div className={cn("max-w-lg mx-auto px-4 pt-4", selectMode ? "pb-28" : "pb-8")}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => (selectMode ? exitSelect() : navigate(-1))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-lg">Guestlist</h1>
          <p className="text-xs text-muted-foreground truncate">
            {selectMode ? `${selected.size} selected` : `${event?.title} · ${guests.length} guests`}
          </p>
        </div>
        {selectMode ? (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={exitSelect}>Cancel</Button>
        ) : (
          <>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}
              onClick={exportCsv}
              disabled={guests.length === 0}
              aria-label="Export guestlist as CSV"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSelectMode(true)} disabled={guests.length === 0}>
              Select
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90" aria-label="Add guests">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-sm">
                <DialogHeader>
                  <DialogTitle className="font-heading">Add Guest</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Quick Add from Friends</p>
                    {friends.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3 bg-secondary/40 rounded-xl border border-border/50">No friends on the app yet — add friends from the Friends tab</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {friends.map((f) => {
                          const alreadyAdded = guests.some((g) => g.guest_email === f.email);
                          const inviting = busyKeys.has(f.email);
                          return (
                            <div key={f.email} className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2 border border-border/50">
                              <Avatar src={f.picture} name={f.name || f.email} size="w-7 h-7" textClass="text-xs" />
                              <span className="flex-1 text-sm font-medium text-foreground truncate">{f.name || f.email}</span>
                              <button
                                onClick={() => addFriendToGuestlist(f)}
                                disabled={alreadyAdded || inviting}
                                className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                                  alreadyAdded || inviting
                                    ? "text-muted-foreground bg-muted cursor-not-allowed"
                                    : "text-primary-foreground bg-primary hover:bg-primary/80"
                                }`}
                              >
                                {alreadyAdded ? "Added" : inviting ? "Inviting…" : "Invite"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="border-t border-border/50 my-3" />
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Add Manually</p>
                  </div>
                  <Input
                    placeholder="Name"
                    value={newGuest.name}
                    onChange={(e) => setNewGuest((p) => ({ ...p, name: e.target.value }))}
                    className="bg-secondary/50 border-border h-11 rounded-xl"
                  />
                  <Input
                    placeholder="Email (or leave blank)"
                    type="email"
                    value={newGuest.email}
                    onChange={(e) => setNewGuest((p) => ({ ...p, email: e.target.value }))}
                    className="bg-secondary/50 border-border h-11 rounded-xl"
                  />
                  <PhoneInput
                    value={newGuest.phone}
                    onChange={(v) => setNewGuest((p) => ({ ...p, phone: v }))}
                    placeholder="Phone (or leave blank)"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground text-center">At least one of email or phone is required</p>
                  <Button className="w-full h-11 rounded-xl bg-primary" onClick={addGuest} disabled={adding}>
                    {adding ? "Adding..." : "Add to Guestlist"}
                  </Button>

                  <div className="border-t border-border/50 my-1" />
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Import a list</p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"Paste one per line — name, email\nMaya Osei, maya@email.com\ntom@email.com"}
                    className="w-full min-h-[84px] bg-secondary/50 border border-border rounded-xl p-3 text-sm resize-none outline-none focus:border-primary/50"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-11 rounded-xl bg-primary"
                      onClick={() => importGuests(parseGuestLines(importText))}
                      disabled={importing || !importText.trim()}
                    >
                      {importing ? "Adding…" : "Add list"}
                    </Button>
                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => csvRef.current?.click()} disabled={importing}>
                      Upload CSV
                    </Button>
                  </div>
                  <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={onCsvFile} />
                  <p className="text-[11px] text-muted-foreground text-center">
                    Matches existing accounts by email, skips duplicates, adds everyone as invited.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Sticky frosted header: capacity + search + tabs. Rows scroll underneath. */}
      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 px-4 pt-2 pb-3 bg-background/80 backdrop-blur-xl border-b border-border/50 space-y-3">
        <div>
          <div className="flex items-center justify-between text-[13px] mb-1.5">
            <span>
              <span className="text-foreground font-bold tabular-nums">{admitted}</span>
              <span className="text-muted-foreground"> {capacity ? `/ ${capacity} approved` : "approved · no limit set"}</span>
            </span>
            {pending > 0 && <span className="text-amber-400 font-semibold">{pending} waiting</span>}
          </div>
          {capacity && (
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round((admitted / capacity) * 100))}%` }} />
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search guests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border h-11 rounded-xl"
          />
        </div>

        <SlidingTabs
          value={activeTab}
          onChange={(t) => { setGlTab(t); setSelected(new Set()); }}
          tabs={[
            { id: "requests", label: "Requests", badge: requests.length },
            { id: "approved", label: "Approved", badge: approved.length },
            { id: "checked", label: "In", badge: checkedIn.length },
            { id: "other", label: "Other" },
          ]}
        />
      </div>

      {/* List */}
      <div className="pt-3 space-y-2">
        {activeTab === "requests" && (requests.length === 0 ? <EmptyTab message="No pending requests" /> : (
          <>
            {!selectMode && (
              <div className="flex items-center justify-center gap-2 pb-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/25">Approve <span className="text-sm leading-none">→</span></span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-red-400 bg-red-500/10 border border-red-500/25"><span className="text-sm leading-none">←</span> Remove</span>
              </div>
            )}
            {requests.map((g, i) => (
              <GuestRow key={g.id} {...rowProps(g)} canSwipe onApprove={swipeApprove} onDeny={swipeDeny} nudge={i === 0 && !selectMode} />
            ))}
          </>
        ))}
        {activeTab === "approved" && (approved.length === 0 ? <EmptyTab message="No approved guests yet" /> : approved.map((g) => <GuestRow key={g.id} {...rowProps(g)} />))}
        {activeTab === "checked" && (checkedIn.length === 0 ? <EmptyTab message="No check-ins yet" /> : checkedIn.map((g) => <GuestRow key={g.id} {...rowProps(g)} />))}
        {activeTab === "other" && (
          <>
            {waitlist.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground uppercase font-semibold px-1">Waitlist</p>
                {waitlist.map((g) => <GuestRow key={g.id} {...rowProps(g)} canSwipe onApprove={swipeApprove} onDeny={swipeDeny} />)}
              </>
            )}
            {denied.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground uppercase font-semibold px-1 mt-4">Denied / Revoked</p>
                {denied.map((g) => <GuestRow key={g.id} {...rowProps(g)} />)}
              </>
            )}
            {waitlist.length === 0 && denied.length === 0 && <EmptyTab message="No waitlisted or denied guests" />}
          </>
        )}
      </div>

      {/* Bulk action bar (select mode) */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pt-6 pb-[calc(12px+env(safe-area-inset-bottom,0px))] bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
          <div className="max-w-lg mx-auto flex gap-2 rounded-2xl border border-border bg-card p-2 shadow-xl pointer-events-auto">
            <Button onClick={() => bulkApply("approved")} disabled={!selected.size || bulkBusy} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">
              Approve{selected.size ? ` ${selected.size}` : ""}
            </Button>
            <Button onClick={() => bulkApply("waitlist")} disabled={!selected.size || bulkBusy} variant="secondary" className="flex-1 rounded-xl">
              Waitlist
            </Button>
            <Button onClick={() => bulkApply("denied")} disabled={!selected.size || bulkBusy} className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 text-white">
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Per-guest action sheet */}
      <Drawer open={!!actionTarget} onOpenChange={(open) => { if (!open) setActionTarget(null); }}>
        <DrawerContent className="bg-card border-border">
          {actionTarget && (
            <div className="max-w-lg mx-auto w-full px-4 pb-6 pt-1">
              <div className="flex items-center gap-3 mb-4">
                <Avatar src={profiles?.[actionTarget.guest_email?.toLowerCase()]?.picture} name={actionTarget.guest_name || actionTarget.guest_email} size="w-11 h-11" textClass="text-base" />
                <div className="min-w-0">
                  <p className="font-heading font-bold truncate">{actionTarget.guest_name || "Guest"}</p>
                  <p className="text-xs text-muted-foreground truncate">{formatPhoneDisplay(actionTarget.guest_phone) || actionTarget.guest_email}</p>
                </div>
              </div>
              <div className="space-y-2">
                {actionsFor(actionTarget).map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => runAction(a.run)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm font-semibold transition-colors hover:bg-secondary",
                      a.tone === "deny" && "text-red-400"
                    )}
                  >
                    <span className={cn("w-8 h-8 rounded-lg grid place-items-center shrink-0", TONE[a.tone])}>
                      <a.Icon className="w-4 h-4" />
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open && !revoking) setRevokeTarget(null); }}>
        <AlertDialogContent className="bg-card border-border max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              Revoke {revokeTarget?.guest_name || revokeTarget?.guest_email || "this guest"}'s pass?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their QR pass will stop working at the door and they will see it as
              revoked. You can re-approve them later from the Other tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Keep pass</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revoking}
              onClick={(e) => { e.preventDefault(); confirmRevoke(); }}
            >
              {revoking ? "Revoking..." : "Revoke pass"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plus-one: capture who the guest is bringing so it shows under them. */}
      <Dialog open={!!plusOneTarget} onOpenChange={(open) => { if (!open && !savingPlusOne) setPlusOneTarget(null); }}>
        <DialogContent className="bg-card border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {plusOneTarget?.plus_one ? "Edit plus-one" : "Add a plus-one"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Who is {plusOneTarget?.guest_name || "this guest"} bringing? They'll be admitted together as one guest.
            </p>
            <Input
              autoFocus
              placeholder="Plus-one's name (optional)"
              value={plusOneName}
              maxLength={80}
              onChange={(e) => setPlusOneName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePlusOne(); }}
              className="bg-secondary/50 border-border h-11 rounded-xl"
            />
            <Button className="w-full h-11 rounded-xl bg-primary" onClick={savePlusOne} disabled={savingPlusOne}>
              {savingPlusOne ? "Saving..." : plusOneTarget?.plus_one ? "Save" : "Add plus-one"}
            </Button>
            {plusOneTarget?.plus_one && (
              <Button variant="ghost" className="w-full h-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10" onClick={removePlusOne} disabled={savingPlusOne}>
                Remove plus-one
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {viewProfile && (
        <FriendProfile
          friend={{
            email: viewProfile.guest_email,
            name: viewProfile.guest_name,
            picture: profiles?.[viewProfile.guest_email?.toLowerCase()]?.picture,
          }}
          myEmail={me?.email}
          myFriends={friends}
          onClose={() => setViewProfile(null)}
        />
      )}
    </div>
  );
}

function EmptyTab({ message }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// A guest row. Tap opens the action sheet (or toggles selection in select
// mode). When canSwipe, a horizontal drag reveals Approve (right) / Remove
// (left) and commits past a threshold. The opaque card hides the action layers
// at rest; vertical drags fall through to page scroll (touch-action: pan-y).
function GuestRow({ guest: g, picture, selectMode, selected, onOpen, onToggle, canSwipe = false, onApprove = (_g) => {}, onDeny = (_g) => {}, nudge = false }) {
  const fg = useRef(null);
  const apRef = useRef(null);
  const dnRef = useRef(null);
  const drag = useRef({ x: 0, y: 0, dir: null, active: false, moved: false });
  const sub = formatPhoneDisplay(g.guest_phone) || g.guest_email || "No contact details";

  // One-time teaching nudge on the first request row: flash Approve then Remove.
  useEffect(() => {
    if (!nudge || !canSwipe) return;
    const rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f = fg.current, ap = apRef.current, dn = dnRef.current;
    if (rm || !f || !ap || !dn) return;
    f.style.transition = "transform .3s ease";
    const timers = [
      setTimeout(() => { ap.style.opacity = "1"; f.style.transform = "translateX(56px)"; }, 450),
      setTimeout(() => { f.style.transform = "translateX(0)"; }, 920),
      setTimeout(() => { ap.style.opacity = "0"; }, 1220),
      setTimeout(() => { dn.style.opacity = "1"; f.style.transform = "translateX(-56px)"; }, 1360),
      setTimeout(() => { f.style.transform = "translateX(0)"; }, 1830),
      setTimeout(() => { dn.style.opacity = "0"; }, 2130),
    ];
    return () => timers.forEach(clearTimeout);
  }, [nudge, canSwipe]);

  const reveal = (dx) => {
    if (apRef.current) apRef.current.style.opacity = dx > 0 ? "1" : "0";
    if (dnRef.current) dnRef.current.style.opacity = dx < 0 ? "1" : "0";
  };
  const snapBack = () => {
    const f = fg.current; if (!f) return;
    f.style.transition = "transform .2s ease";
    f.style.transform = "translateX(0)";
    reveal(0);
  };

  const onDown = (e) => {
    if (selectMode || !canSwipe) return;
    drag.current = { x: e.clientX, y: e.clientY, dir: null, active: true, moved: false };
    if (fg.current) fg.current.style.transition = "none";
  };
  const onMove = (e) => {
    const d = drag.current; if (!d.active) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.dir === null) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        d.dir = "h";
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      } else if (Math.abs(dy) > 6) { d.dir = "v"; d.active = false; return; }
      else return;
    }
    d.moved = true;
    e.preventDefault();
    if (fg.current) fg.current.style.transform = `translateX(${dx}px)`;
    reveal(dx);
  };
  const onUp = (e) => {
    const d = drag.current; if (!d.active) return;
    const dx = e.clientX - d.x;
    d.active = false;
    if (d.dir === "h" && Math.abs(dx) > 88) {
      const approve = dx > 0;
      const f = fg.current;
      if (f) { f.style.transition = "transform .18s ease"; f.style.transform = `translateX(${approve ? "110%" : "-110%"})`; }
      setTimeout(() => (approve ? onApprove(g) : onDeny(g)), 170);
    } else if (d.dir === "h") {
      snapBack();
    }
  };
  const onClick = () => {
    if (selectMode) { onToggle(g); return; }
    if (canSwipe && drag.current.moved) { drag.current.moved = false; return; } // was a swipe, not a tap
    onOpen(g);
  };

  return (
    <div className="relative rounded-xl overflow-hidden">
      {canSwipe && !selectMode && (
        <>
          <div ref={apRef} className="absolute inset-0 flex items-center justify-start gap-2 px-5 bg-emerald-600 text-white text-sm font-semibold opacity-0 transition-opacity pointer-events-none">
            <Check className="w-4 h-4" /> Approve
          </div>
          <div ref={dnRef} className="absolute inset-0 flex items-center justify-end gap-2 px-5 bg-red-600 text-white text-sm font-semibold opacity-0 transition-opacity pointer-events-none">
            Remove <X className="w-4 h-4" />
          </div>
        </>
      )}
      <div
        ref={fg}
        role="button"
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={snapBack}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        className="relative w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60 text-left touch-pan-y select-none cursor-pointer hover:border-border"
      >
        {selectMode ? (
          <span className={cn("w-10 h-10 rounded-full border-2 grid place-items-center shrink-0 transition-colors", selected ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
            {selected && <Check className="w-5 h-5" />}
          </span>
        ) : (
          <Avatar src={picture} name={g.guest_name || g.guest_email} size="w-10 h-10" textClass="text-sm" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{g.guest_name || "Unknown"}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
          {g.plus_one && (
            <span className="inline-flex items-center gap-1 text-[11px] text-accent mt-0.5 truncate">
              <UserPlus className="w-3 h-3 shrink-0" />
              <span className="truncate">{g.plus_one_name ? `+1 · ${g.plus_one_name}` : "+1"}</span>
            </span>
          )}
        </div>
        {!selectMode && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>
    </div>
  );
}
