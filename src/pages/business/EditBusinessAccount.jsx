import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import Avatar from "@/components/Avatar";
import ProfilePictureEditor from "@/components/ProfilePictureEditor";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";

// Edits an existing BusinessAccount's name, email, and picture (square crop
// via ProfilePictureEditor). Stripe Connect fields are intentionally left
// untouched — those stay managed through the Stripe Connect flow.
export default function EditBusinessAccount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picture, setPicture] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const list = await api.entities.BusinessAccount.filter({ id });
      if (!list.length) { navigate(-1); return; }
      const b = list[0];
      setName(b.business_name || "");
      setEmail(b.business_email || "");
      setPicture(b.business_picture || "");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoSave(file_url) {
    setPicture(file_url);
    setPendingPhoto(null);
  }

  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.entities.BusinessAccount.update(id, {
        business_name: name.trim(),
        business_email: email.trim().toLowerCase(),
        business_picture: picture,
      });
      await qc.invalidateQueries(["activeBusiness"]);
      toast({ title: "Business account updated" });
      navigate(-1);
    } catch (e) {
      toast({ title: e?.message || "Couldn't save", variant: "destructive" });
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Edit Business Account</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative">
            <Avatar src={picture} name={name} size="w-16 h-16" textClass="text-2xl" />
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card" onClick={() => fileRef.current?.click()}>
              <Camera className="w-3 h-3 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingPhoto(f); e.target.value = ""; }} />
          </div>
          <div>
            <p className="font-heading font-bold text-base truncate">{name || "Business"}</p>
            <p className="text-xs text-muted-foreground">Tap the photo to change it</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Business Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" className="bg-secondary/50 border-border h-11 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Business Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="business@email.com" className="bg-secondary/50 border-border h-11 rounded-xl" />
          </div>
        </div>

        <Button className="w-full h-11 rounded-xl bg-primary mt-5" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Stripe Connect settings are managed separately from your payouts panel.
      </p>

      {pendingPhoto && (
        <ProfilePictureEditor file={pendingPhoto} onSave={handlePhotoSave} onClose={() => setPendingPhoto(null)} />
      )}
    </div>
  );
}