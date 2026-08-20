import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useSwitchAccount } from "@/hooks/useActiveAccount";
import ProfilePictureEditor from "@/components/ProfilePictureEditor";
import { Building2, Camera, Loader2 } from "lucide-react";

export default function CreateBusinessDialog({ user, onClose }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { switchToBusiness } = useSwitchAccount();
  const [name, setName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [picture, setPicture] = useState(user?.profile_picture || "");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function handlePhotoSave(file_url) {
    setPicture(file_url);
    setPendingPhoto(null);
  }

  async function handleCreate() {
    if (!name.trim() || !email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const biz = await base44.entities.BusinessAccount.create({
        owner_email: user.email,
        business_email: email.trim().toLowerCase(),
        business_name: name.trim(),
        business_picture: picture,
      });
      await switchToBusiness(biz.id);
      toast({ title: "Business account created!" });
      onClose();
      navigate("/business/create-event");
    } catch (e) {
      toast({ title: e?.message || "Couldn't create business account", variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 px-4 pb-8">
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold text-lg">Create Business Account</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">A separate account for your company's events with its own payouts. You can reuse your details or enter different ones.</p>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {picture ? <img src={picture} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-primary">{(name || "?")[0].toUpperCase()}</span>}
            </div>
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card" onClick={() => fileRef.current?.click()}>
              <Camera className="w-3 h-3 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingPhoto(f); e.target.value = ""; }} />
          </div>
          <button className="text-xs text-muted-foreground underline" onClick={() => setPicture(user?.profile_picture || "")}>Use personal photo</button>
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

        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 rounded-xl bg-primary" disabled={saving} onClick={handleCreate}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </div>
      </div>

      {pendingPhoto && (
        <ProfilePictureEditor file={pendingPhoto} onSave={handlePhotoSave} onClose={() => setPendingPhoto(null)} />
      )}
    </div>
  );
}