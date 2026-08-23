import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, User, Calendar, Camera, ArrowLeft, Pencil, Check, X, Shield, Trash2, AtSign, Clock, Users, Mic2, ChevronRight, Building2, ArrowLeftRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import Avatar from "../components/Avatar";
import PromoterAccountSection from "../components/PromoterAccountSection";
import StripeConnectPanel from "../components/StripeConnectPanel";
import ProfilePictureEditor from "../components/ProfilePictureEditor";
import CreateBusinessDialog from "../components/business/CreateBusinessDialog";
import { useSwitchAccount } from "@/hooks/useActiveAccount";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationDot from "../components/NotificationDot";
import CoHostInvitesSection from "../components/CoHostInvitesSection";

export default function Profile() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { switchToBusiness } = useSwitchAccount();
  const { data: notifs } = useNotifications();
  const coHostInvites = notifs?.coHostInvites ?? [];
  const coHostCount = notifs?.counts?.coHost ?? 0;
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ hosted: 0, attended: 0 });
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editing, setEditing] = useState(null); // "name" | "phone" | "instagram"
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [adminTapCount, setAdminTapCount] = useState(0);
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [businessAccounts, setBusinessAccounts] = useState([]);
  const [showCreateBiz, setShowCreateBiz] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    await base44.auth.updateMe({ deleted: true, email: `deleted_${Date.now()}@deleted.com` });
    base44.auth.logout();
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const me = await base44.auth.me();
    setUser(me);
    const [events, entries] = await Promise.all([
      base44.entities.Event.filter({ host_email: me.email }),
      base44.entities.GuestlistEntry.filter({ guest_email: me.email }),
    ]);

    const businesses = await base44.entities.BusinessAccount.filter({ owner_email: me.email });
    setBusinessAccounts(businesses);
    setStats({
      hosted: events.filter((e) => !e.business_id).length,
      attended: entries.filter((e) => ["checked_in", "checked_out"].includes(e.status) || e.checked_in_at).length,
    });
    setLoading(false);
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    setShowPhotoMenu(false);
    e.target.value = "";
  }

  async function handlePhotoSave(file_url) {
    setUploadingPhoto(true);
    await base44.auth.updateMe({ profile_picture: file_url });
    setUser((prev) => ({ ...prev, profile_picture: file_url }));
    setPendingPhoto(null);
    setUploadingPhoto(false);
    toast({ title: "Photo updated" });
  }

  function startEdit(field) {
    setEditing(field);
    setEditValue(field === "name" ? user?.full_name || "" : field === "phone" ? user?.phone || "" : user?.instagram || "");
  }

  async function saveEdit() {
    if (!editValue.trim()) return;
    setSaving(true);
    const update = editing === "name" ? { full_name: editValue.trim() } : editing === "phone" ? { phone: editValue.trim() } : { instagram: editValue.trim().replace(/^@/, "") };
    await base44.auth.updateMe(update);
    setUser((prev) => ({ ...prev, ...update }));
    setEditing(null);
    setSaving(false);
    toast({ title: "Saved!" });
  }

  function handleVersionTap() {
    const next = adminTapCount + 1;
    setAdminTapCount(next);
    if (next >= 7) {
      setShowAdminPin(true);
      setAdminTapCount(0);
    }
  }

  function handleAdminPin() {
    if (adminPin === "1234") {
      base44.auth.updateMe({ role: "admin" }).then(() => {
        toast({ title: "Admin access granted" });
        setShowAdminPin(false);
        loadProfile();
      });
    } else {
      toast({ title: "Incorrect PIN" });
      setAdminPin("");
    }
  }

  async function handleSwitchBusiness(id) {
    await switchToBusiness(id);
    navigate("/business/create-event");
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="relative flex items-center gap-3 mb-6">
        <Link to="/">
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <h1 className="font-heading font-bold text-xl flex-1">Account</h1>
        <NotificationDot count={coHostCount} className="top-0 right-0 w-4 h-4" />
      </div>

      {/* User Card */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar src={user?.profile_picture} name={user?.full_name} size="w-16 h-16" textClass="text-2xl" />
            <button
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card"
              onClick={() => setShowPhotoMenu((s) => !s)}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Camera className="w-3 h-3 text-white" />
              )}
            </button>
            {showPhotoMenu && (
              <div className="absolute top-full right-0 mt-2 z-20 bg-card border border-border rounded-xl shadow-xl py-1 w-40">
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2"
                  onClick={() => { cameraInputRef.current?.click(); }}
                >
                  <Camera className="w-4 h-4 text-primary" /> Take Photo
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2"
                  onClick={() => { fileInputRef.current?.click(); }}
                >
                  <Camera className="w-4 h-4 text-muted-foreground" /> Choose Photo
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoChange} />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg">{user?.full_name}</h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-secondary/50 rounded-xl p-3 text-center border border-border/50">
            <p className="text-xl font-bold font-heading text-primary">{stats.hosted}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Events Hosted</p>
          </div>
          <div className="bg-secondary/50 rounded-xl p-3 text-center border border-border/50">
            <p className="text-xl font-bold font-heading text-accent">{stats.attended}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Events Attended</p>
          </div>
        </div>
      </div>

      <CoHostInvitesSection invites={coHostInvites} />

      {/* Host Mode */}
      <Link to="/host" className="block group mb-4">
        <div className="relative rounded-2xl border border-violet-500/20 hover:border-violet-400/60 bg-card overflow-hidden transition-all duration-300 active:scale-[0.99]">
          <div className="h-[2px] w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-4 p-4">
            <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0 border border-white/5">
              <Mic2 className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-heading font-bold text-base text-foreground">Host Mode</p>
                <span className="text-[9px] font-mono font-bold tracking-widest px-1.5 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20">
                  HOST
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">Create & manage your events</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-all" />
          </div>
        </div>
      </Link>

      {/* Business Account */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-4">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4" /> Business Account
        </h3>
        {businessAccounts.length === 0 ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">Create a separate account for your company's events with its own payouts.</p>
            <Button variant="outline" className="w-full rounded-xl gap-2" onClick={() => setShowCreateBiz(true)}>
              <Building2 className="w-4 h-4" /> Create business account
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            {businessAccounts.map((b) => (
              <div key={b.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl p-3 border border-border/50">
                <button onClick={() => navigate(`/business/${b.id}/edit`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Avatar src={b.business_picture} name={b.business_name} size="w-9 h-9" textClass="text-sm" className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{b.business_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{b.business_email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
                <Button size="sm" className="rounded-lg gap-1.5 flex-shrink-0" onClick={() => handleSwitchBusiness(b.id)}>
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Switch
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editable Info */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden mb-4">
        {/* Display Name */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          <User className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">Display Name</p>
            {editing === "name" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 text-sm bg-secondary/50 border-border rounded-lg flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <button onClick={saveEdit} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium">{user?.full_name || "—"}</p>
            )}
          </div>
          {editing !== "name" && (
            <button onClick={() => startEdit("name")} className="text-muted-foreground hover:text-foreground">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          <User className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">Email</p>
            <p className="text-sm font-medium">{user?.email}</p>
          </div>
        </div>

        {/* Phone */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
            {editing === "phone" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="h-8 text-sm bg-secondary/50 border-border rounded-lg flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <button onClick={saveEdit} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium">{user?.phone || <span className="text-muted-foreground">Add phone number</span>}</p>
            )}
          </div>
          {editing !== "phone" && (
            <button onClick={() => startEdit("phone")} className="text-muted-foreground hover:text-foreground">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Instagram */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <AtSign className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-0.5">Instagram</p>
            {editing === "instagram" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="yourhandle"
                  className="h-8 text-sm bg-secondary/50 border-border rounded-lg flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                />
                <button onClick={saveEdit} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {user?.instagram ? (
                  <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline">@{user.instagram}</a>
                ) : (
                  <span className="text-muted-foreground">Add Instagram</span>
                )}
              </p>
            )}
          </div>
          {editing !== "instagram" && (
            <button onClick={() => startEdit("instagram")} className="text-muted-foreground hover:text-foreground">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <PromoterAccountSection email={user?.email} />

      <StripeConnectPanel />

      {user?.role === "admin" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs text-primary font-semibold">Admin Access</span>
        </div>
      )}

      <Button
        variant="outline"
        className="w-full h-12 rounded-xl font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 mb-3"
        onClick={() => base44.auth.logout()}
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>

      <Button
        variant="ghost"
        className="w-full h-12 rounded-xl font-semibold text-destructive/60 hover:text-destructive hover:bg-destructive/10"
        onClick={() => setShowDeleteConfirm(true)}
      >
        <Trash2 className="w-4 h-4 mr-2" /> Delete Account
      </Button>

      {/* Hidden admin unlock */}
      <div className="mt-10 text-center">
        <button onClick={handleVersionTap} className="text-[10px] text-muted-foreground/30 select-none">
          v1.0.0
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm">
            <p className="font-heading font-bold text-lg mb-1">Delete Account</p>
            <p className="text-sm text-muted-foreground mb-4">This permanently deletes your account, events, and guestlist data. Type <strong>DELETE</strong> to confirm.</p>
            <Input
              placeholder="Type DELETE"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="bg-secondary/50 border-border h-11 rounded-xl mb-3"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-destructive hover:bg-destructive/90"
                disabled={deleteConfirmText !== "DELETE"}
                onClick={handleDeleteAccount}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingPhoto && (
        <ProfilePictureEditor
          file={pendingPhoto}
          onSave={handlePhotoSave}
          onClose={() => setPendingPhoto(null)}
        />
      )}

      {showCreateBiz && (
        <CreateBusinessDialog user={user} onClose={() => setShowCreateBiz(false)} />
      )}

      {showAdminPin && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 pb-8 px-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm">
            <p className="text-sm font-semibold mb-3 text-center">Admin Access</p>
            <Input
              type="password"
              placeholder="Enter PIN"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="bg-secondary/50 border-border h-11 rounded-xl mb-3 text-center tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && handleAdminPin()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setShowAdminPin(false); setAdminPin(""); }}>
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl" onClick={handleAdminPin}>
                Unlock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}