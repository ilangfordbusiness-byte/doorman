import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, User, Shield, ChevronRight, Calendar, Camera, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ hosted: 0, attended: 0 });
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

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

    setStats({
      hosted: events.length,
      attended: entries.filter((e) => e.status === "checked_in").length,
    });

    setLoading(false);
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ profile_picture: file_url });
    setUser((prev) => ({ ...prev, profile_picture: file_url }));
    setUploadingPhoto(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/">
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <h1 className="font-heading font-bold text-xl">Account</h1>
      </div>

      {/* User Card */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {user?.profile_picture ? (
                <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary font-heading">
                  {(user?.full_name || "?")[0].toUpperCase()}
                </span>
              )}
            </div>
            <button
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Camera className="w-3 h-3 text-white" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
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

      {/* Menu */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <MenuItem icon={<User className="w-5 h-5" />} label="Account Info" sublabel={user?.email} />
        <MenuItem icon={<Shield className="w-5 h-5" />} label="Role" sublabel={user?.role || "user"} />
        <MenuItem icon={<Calendar className="w-5 h-5" />} label="My Events" sublabel={`${stats.hosted} events`} />
      </div>

      <Button
        variant="outline"
        className="w-full mt-6 h-12 rounded-xl font-semibold text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => base44.auth.logout()}
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>
    </div>
  );
}

function MenuItem({ icon, label, sublabel }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50 last:border-0">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}