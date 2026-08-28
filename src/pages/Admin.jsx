import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/data";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ArrowLeft, Shield, Ban, Search, Trash2, EyeOff, XCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import moment from "moment";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "users", label: "Users" },
  { id: "events", label: "Events" },
  { id: "audit", label: "Audit" },
];

export default function Admin() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const [tab, setTab] = useState("dashboard");

  if (meLoading) return <LoadingSpinner fullScreen />;
  // UI guard only — the edge functions re-check the admin role server-side.
  if (me?.role !== "admin") return <Navigate to="/" replace />;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="font-heading font-bold text-xl">Admin</h1>
      </div>

      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "users" && <Users myId={me.id} />}
      {tab === "events" && <Events />}
      {tab === "audit" && <Audit />}
    </div>
  );
}

// --- Dashboard ------------------------------------------------------------

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const m = await api.admin.metrics();
        if (active) setMetrics(m);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="py-16"><LoadingSpinner /></div>;
  if (!metrics) return <p className="text-sm text-muted-foreground">Couldn't load metrics.</p>;

  const money = (minor) => `£${(Number(minor || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const tiles = [
    { label: "Users", value: metrics.users },
    { label: "Admins", value: metrics.admins },
    { label: "Banned", value: metrics.banned },
    { label: "Events", value: metrics.events },
    { label: "Published", value: metrics.published_events },
    { label: "Paid orders", value: metrics.paid_orders },
    { label: "GMV", value: money(metrics.gmv_minor) },
    { label: "Platform fees", value: money(metrics.fees_minor) },
    { label: "Refunded", value: `${metrics.refunded_orders} · ${money(metrics.refunded_minor)}` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card rounded-xl border border-border p-4">
          <p className="text-2xl font-bold font-heading">{t.value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

// --- Users ----------------------------------------------------------------

function Users({ myId }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setUsers(await api.admin.listUsers({ search: search.trim() }));
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function act(userId, fn, successMsg) {
    setBusy(userId);
    try {
      await fn();
      toast({ title: successMsg });
      await load();
    } catch (e) {
      toast({ title: e.message || "Action failed", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 rounded-xl" />
      </div>

      {loading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
      ) : (
        users.map((u) => {
          const isMe = u.id === myId;
          const isAdmin = u.role === "admin";
          const banned = !!u.banned_at;
          return (
            <div key={u.id} className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <UserAvatar email={u.email} fallbackSrc={u.profile_picture} name={u.full_name} size="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{u.full_name || "—"}</p>
                    {isAdmin && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold uppercase">Admin</span>}
                    {banned && <span className="text-[9px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full font-semibold uppercase">Banned</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  {u.instagram && <p className="text-xs text-pink-400">@{u.instagram}</p>}
                </div>
              </div>
              {!isMe && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="secondary" className="rounded-lg h-8" disabled={busy === u.id}
                    onClick={() => act(u.id, () => api.admin.setRole(u.id, isAdmin ? "user" : "admin"), isAdmin ? "Admin removed" : "Made admin")}>
                    <Shield className="w-3.5 h-3.5" /> {isAdmin ? "Remove admin" : "Make admin"}
                  </Button>
                  <Button size="sm" variant="secondary" className="rounded-lg h-8" disabled={busy === u.id} onClick={() => setEditing(u)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant={banned ? "secondary" : "destructive"} className="rounded-lg h-8" disabled={busy === u.id}
                    onClick={() => {
                      if (!banned && !window.confirm(`Ban ${u.email}? They will be unable to sign in.`)) return;
                      act(u.id, () => (banned ? api.admin.unbanUser(u.id) : api.admin.banUser(u.id)), banned ? "User unbanned" : "User banned");
                    }}>
                    <Ban className="w-3.5 h-3.5" /> {banned ? "Unban" : "Ban"}
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditUserDialog({ user, onClose, onSaved }) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user.full_name || "");
  const [instagram, setInstagram] = useState(user.instagram || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.admin.updateUser(user.id, {
        full_name: fullName,
        instagram: instagram.replace(/^@/, ""),
        phone,
      });
      toast({ title: "User updated" });
      await onSaved();
    } catch (e) {
      toast({ title: e.message || "Update failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4 py-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-heading font-bold text-lg mb-1">Edit user</h2>
        <p className="text-xs text-muted-foreground mb-4 truncate">{user.email}</p>
        <label className="text-xs text-muted-foreground">Full name</label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mb-3 mt-1 rounded-lg" />
        <label className="text-xs text-muted-foreground">Instagram</label>
        <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} className="mb-3 mt-1 rounded-lg" />
        <label className="text-xs text-muted-foreground">Phone</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-4 mt-1 rounded-lg" />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 rounded-lg" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 rounded-lg" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

// --- Events ---------------------------------------------------------------

function Events() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    try {
      setEvents(await api.admin.listEvents({ search: search.trim() }));
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't load events", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function act(id, fn, msg) {
    setBusy(id);
    try {
      await fn();
      toast({ title: msg });
      await load();
    } catch (e) {
      toast({ title: e.message || "Action failed", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search event title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 rounded-xl" />
      </div>

      {loading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No events found.</p>
      ) : (
        events.map((ev) => (
          <div key={ev.id} className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{ev.title || "Untitled"}</p>
                <p className="text-xs text-muted-foreground">
                  {ev.date ? moment(ev.date).format("MMM D, YYYY") : "—"} · <span className="uppercase">{ev.status}</span>
                </p>
              </div>
              <Link to={`/event/${ev.id}`}>
                <Button size="sm" variant="ghost" className="rounded-lg h-8">View</Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {ev.status === "published" && (
                <Button size="sm" variant="secondary" className="rounded-lg h-8" disabled={busy === ev.id}
                  onClick={() => act(ev.id, () => api.admin.updateEventStatus(ev.id, "unpublish"), "Event unpublished")}>
                  <EyeOff className="w-3.5 h-3.5" /> Unpublish
                </Button>
              )}
              {ev.status !== "cancelled" && (
                <Button size="sm" variant="secondary" className="rounded-lg h-8" disabled={busy === ev.id}
                  onClick={() => { if (window.confirm(`Cancel "${ev.title}"?`)) act(ev.id, () => api.admin.updateEventStatus(ev.id, "cancel"), "Event cancelled"); }}>
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
              <Button size="sm" variant="destructive" className="rounded-lg h-8" disabled={busy === ev.id}
                onClick={() => { if (window.confirm(`Permanently delete "${ev.title}"? This cannot be undone.`)) act(ev.id, () => api.admin.deleteEvent(ev.id), "Event deleted"); }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// --- Audit ----------------------------------------------------------------

function Audit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.admin.listAuditLog();
        if (active) setRows(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="py-16"><LoadingSpinner /></div>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No admin actions logged yet.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="bg-card rounded-xl border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{r.action}</p>
            <p className="text-[11px] text-muted-foreground">{moment(r.created_at).format("MMM D, HH:mm")}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {r.admin_email || "—"} · {r.target_type}:{r.target_id?.slice(0, 8)}
            {r.metadata && Object.keys(r.metadata).length > 0 && ` · ${JSON.stringify(r.metadata)}`}
          </p>
        </div>
      ))}
    </div>
  );
}
