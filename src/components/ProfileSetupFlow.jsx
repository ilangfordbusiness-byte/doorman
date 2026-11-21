import { useState, useRef } from "react";
import { api } from "@/api/data";
import { User, Phone, Instagram, Camera, ChevronRight, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhoneInput from "@/components/PhoneInput";
import ProfilePictureEditor from "@/components/ProfilePictureEditor";
import { normalizePhone } from "@/lib/phone";
import { ORDER, avatarMandatory, avatarRequired, firstMissing } from "@/lib/profileSetup";

// The onboarding screens (name, phone, Instagram, photo). Loaded lazily by
// PhoneSetupGate only for users with a step left, so everyone else never
// downloads the phone library or the photo editor. `me` is the profile the
// app already loaded at sign-in; rules live in lib/profileSetup.js.


export default function ProfileSetupFlow({ me, children }) {
  const wantAvatar = avatarRequired(me);
  const nameParts = (me?.full_name || "").trim().split(/\s+/);
  const [step, setStep] = useState(() => firstMissing(me, wantAvatar));
  // The fields missing at first load, for the "Step x of y" counter.
  const [steps] = useState(() => ORDER.filter((s) => {
    if (s === "name") return firstMissing(me, wantAvatar) === "name";
    if (s === "phone") return !me?.phone;
    if (s === "instagram") return !me?.instagram;
    if (s === "avatar") return wantAvatar && !me?.profile_picture;
    return false;
  }));
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [includeAvatar, setIncludeAvatar] = useState(wantAvatar);
  const avatarMust = avatarMandatory(me); // new accounts: no skip
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  async function advance(patch) {
    setSaving(true);
    try {
      const updated = await api.auth.updateMe(patch);
      setStep(firstMissing(updated, includeAvatar));
    } finally {
      setSaving(false);
    }
  }

  const saveName = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    advance({ full_name: `${firstName.trim()} ${lastName.trim()}` });
  };
  const savePhone = () => {
    if (!phone.trim()) return;
    advance({ phone: normalizePhone(phone) });
  };
  const saveInstagram = () => {
    if (!instagram.trim()) return;
    advance({ instagram: instagram.trim().replace(/^@/, "") });
  };
  const saveAvatar = async (fileUrl) => {
    setPhotoFile(null);
    await advance({ profile_picture: fileUrl });
  };
  // "Later": persist the dismissal on the profile and release the gate. Not via
  // advance(), since firstMissing() would still report the (empty) avatar step;
  // avatar is last in ORDER so nothing else can be pending here.
  const dismissAvatar = async () => {
    setSaving(true);
    try {
      await api.auth.updateMe({ avatar_prompt_dismissed_at: new Date().toISOString() });
      setIncludeAvatar(false);
      setStep(null);
    } finally {
      setSaving(false);
    }
  };

  if (!step) return children;

  const counter = steps.length > 1 ? `Step ${steps.indexOf(step) + 1} of ${steps.length}` : null;

  function shell(icon, iconWrap, title, subtitle, body) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-background screen-scroll">
        <div className="screen-fill flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <img src="/logo-256.png" alt="DoorMan" className="w-12 h-12 object-contain" />
            <span className="font-heading font-bold text-white text-2xl">DoorMan</span>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 mx-auto ${iconWrap}`}>
            {icon}
          </div>
          <h1 className="font-heading font-bold text-2xl text-center mb-1">{title}</h1>
          <p className="text-muted-foreground text-sm text-center mb-7">{subtitle}</p>
          {body}
          {counter && <p className="text-xs text-muted-foreground text-center mt-4">{counter}</p>}
        </div>
        </div>
      </div>
    );
  }

  if (step === "name") {
    return shell(
      <User className="w-6 h-6 text-primary" />, "bg-primary/15",
      "Welcome!", "Let's set up your profile. What's your name?",
      <>
        <div className="space-y-3 mb-5">
          <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl" autoFocus
            onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && saveName()} />
        </div>
        <Button className="w-full h-12 rounded-xl font-semibold text-base gap-2" onClick={saveName}
          disabled={saving || !firstName.trim() || !lastName.trim()}>
          {saving ? "Saving..." : "Continue"} {!saving && <ChevronRight className="w-4 h-4" />}
        </Button>
      </>
    );
  }

  if (step === "phone") {
    return shell(
      <Phone className="w-6 h-6 text-emerald-400" />, "bg-emerald-500/15",
      "Your phone number", "Hosts and staff use your number to find you on the guestlist.",
      <>
        <div className="mb-5">
          <PhoneInput value={phone} onChange={setPhone} className="h-12" autoFocus onEnter={savePhone} />
        </div>
        <Button className="w-full h-12 rounded-xl font-semibold text-base gap-2" onClick={savePhone}
          disabled={saving || !phone.trim()}>
          {saving ? "Saving..." : "Continue"} {!saving && <ChevronRight className="w-4 h-4" />}
        </Button>
      </>
    );
  }

  if (step === "instagram") {
    return shell(
      <Instagram className="w-6 h-6 text-pink-400" />, "bg-pink-500/15",
      "Your Instagram", "So friends and hosts can recognise and find you.",
      <>
        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
          <Input placeholder="yourhandle" value={instagram}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
            className="bg-secondary/50 border-border h-12 rounded-xl pl-8" autoFocus
            onKeyDown={(e) => e.key === "Enter" && saveInstagram()} />
        </div>
        <Button className="w-full h-12 rounded-xl font-semibold text-base gap-2" onClick={saveInstagram}
          disabled={saving || !instagram.trim()}>
          {saving ? "Saving..." : "Continue"} {!saving && <ChevronRight className="w-4 h-4" />}
        </Button>
      </>
    );
  }

  // avatar
  return shell(
    <Camera className="w-6 h-6 text-primary" />, "bg-primary/15",
    "Add a profile picture", "Put a face to your name — people recognise you on guestlists and your friends can find you. It only takes a second.",
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoFile(f); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoFile(f); e.target.value = ""; }} />
      <Button className="w-full h-12 rounded-xl font-semibold text-base gap-2" onClick={() => fileRef.current?.click()}
        disabled={saving}>
        <Image className="w-4 h-4" /> {saving ? "Saving..." : "Choose from photos"}
      </Button>
      <Button variant="outline" className="w-full h-12 rounded-xl font-semibold text-base gap-2 mt-2"
        onClick={() => cameraRef.current?.click()} disabled={saving}>
        <Camera className="w-4 h-4" /> Take a photo
      </Button>
      {avatarMust ? (
        <p className="text-center text-xs text-muted-foreground/70 mt-4">A profile picture is required to continue.</p>
      ) : (
        <button onClick={dismissAvatar} disabled={saving}
          className="block mx-auto mt-4 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Skip for now
        </button>
      )}
      {photoFile && (
        <ProfilePictureEditor file={photoFile} onSave={saveAvatar} onClose={() => setPhotoFile(null)} />
      )}
    </>
  );
}
