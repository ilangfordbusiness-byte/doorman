import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";
import { User, Phone, Instagram, Camera, ChevronRight, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhoneInput from "@/components/PhoneInput";
import ProfilePictureEditor from "@/components/ProfilePictureEditor";
import { normalizePhone } from "@/lib/phone";

// Mandatory onboarding gate. Every signed-in user must have a full name, phone
// and instagram before using the app, and is asked for a profile picture. Email
// sign-ups supply name/phone/instagram at signup (so they only see the avatar
// step); Google sign-ins are walked through whichever fields they're missing.
// The avatar lives here (not on the signup form) because uploading it needs a
// session. The picture step can be skipped with a faint "Skip for now", which
// stamps profiles.avatar_prompt_dismissed_at — but that only SNOOZES it for a
// week: any user still without a picture is nudged again on their next visit
// after 7 days. A picture can still be added any time from /profile.
const ORDER = ["name", "phone", "instagram", "avatar"];

// Re-ask users without a profile picture about once a week (on app open).
const AVATAR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
function avatarRequired(me) {
  if (!me || me.profile_picture) return false;              // already has a picture
  const snoozed = me.avatar_prompt_dismissed_at;            // last "Skip for now"
  if (snoozed && Date.now() - new Date(snoozed).getTime() < AVATAR_SNOOZE_MS) return false;
  return true;                                              // no picture, not snoozed this week
}

function firstMissing(me, includeAvatar) {
  const hasName = !!me?.full_name && me.full_name.trim().split(/\s+/).length >= 2;
  if (!hasName) return "name";
  if (!me?.phone) return "phone";
  if (!me?.instagram) return "instagram";
  if (includeAvatar && !me?.profile_picture) return "avatar";
  return null;
}

export default function PhoneSetupGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(null);
  const [steps, setSteps] = useState([]); // the fields missing at first load, for the counter
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [includeAvatar, setIncludeAvatar] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    api.auth.me().then((me) => {
      const parts = (me?.full_name || "").trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
      const wantAvatar = avatarRequired(me);
      setIncludeAvatar(wantAvatar);
      const missing = ORDER.filter((s) => {
        if (s === "name") return firstMissing(me, wantAvatar) === "name";
        if (s === "phone") return !me?.phone;
        if (s === "instagram") return !me?.instagram;
        if (s === "avatar") return wantAvatar && !me?.profile_picture;
        return false;
      });
      setSteps(missing);
      setStep(firstMissing(me, wantAvatar));
      setChecking(false);
    });
  }, []);

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

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!step) return children;

  const counter = steps.length > 1 ? `Step ${steps.indexOf(step) + 1} of ${steps.length}` : null;

  function shell(icon, iconWrap, title, subtitle, body) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <img src="/logo.png" alt="DoorMan" className="w-12 h-12 object-contain" />
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
      <button onClick={dismissAvatar} disabled={saving}
        className="block mx-auto mt-4 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
        Skip for now
      </button>
      {photoFile && (
        <ProfilePictureEditor file={photoFile} onSave={saveAvatar} onClose={() => setPhotoFile(null)} />
      )}
    </>
  );
}
