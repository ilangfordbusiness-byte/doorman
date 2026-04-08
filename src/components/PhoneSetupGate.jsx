import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { User, Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PhoneSetupGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(null); // null = done, "name" = needs name, "phone" = needs phone
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then((me) => {
      setUser(me);
      const hasName = me?.full_name && me.full_name.trim().split(" ").length >= 2 && me.full_name.trim() !== "";
      const hasPhone = !!me?.phone;
      if (!hasName) {
        // Pre-fill if partial name exists
        const parts = (me?.full_name || "").trim().split(" ");
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setStep("name");
      } else if (!hasPhone) {
        setStep("phone");
      } else {
        setStep(null);
      }
      setChecking(false);
    });
  }, []);

  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    await base44.auth.updateMe({ full_name: `${firstName.trim()} ${lastName.trim()}` });
    // Check if phone is also needed
    if (!user?.phone) {
      setStep("phone");
    } else {
      setStep(null);
    }
    setSaving(false);
  }

  async function savePhone() {
    if (!phone.trim()) return;
    setSaving(true);
    await base44.auth.updateMe({ phone: phone.trim() });
    setStep(null);
    setSaving(false);
  }

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "name") {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 mb-8 justify-center">
            <img src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png" alt="DoorMan" className="w-12 h-12 object-contain" />
            <span className="font-heading font-bold text-white text-2xl">DoorMan</span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center mb-5 mx-auto">
            <User className="w-6 h-6 text-primary" />
          </div>

          <h1 className="font-heading font-bold text-2xl text-center mb-1">Welcome!</h1>
          <p className="text-muted-foreground text-sm text-center mb-7">Let's set up your profile. What's your name?</p>

          <div className="space-y-3 mb-5">
            <Input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <Input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
          </div>

          <Button
            className="w-full h-12 rounded-xl font-semibold text-base gap-2"
            onClick={saveName}
            disabled={saving || !firstName.trim() || !lastName.trim()}
          >
            {saving ? "Saving..." : "Continue"} {!saving && <ChevronRight className="w-4 h-4" />}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4">Step 1 of 2</p>
        </div>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 mb-8 justify-center">
            <img src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png" alt="DoorMan" className="w-12 h-12 object-contain" />
            <span className="font-heading font-bold text-white text-2xl">DoorMan</span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-5 mx-auto">
            <Phone className="w-6 h-6 text-emerald-400" />
          </div>

          <h1 className="font-heading font-bold text-2xl text-center mb-1">Your phone number</h1>
          <p className="text-muted-foreground text-sm text-center mb-7">Hosts and staff use your number to find you on the guestlist.</p>

          <div className="mb-5">
            <Input
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
              type="tel"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && savePhone()}
            />
          </div>

          <Button
            className="w-full h-12 rounded-xl font-semibold text-base gap-2"
            onClick={savePhone}
            disabled={saving || !phone.trim()}
          >
            {saving ? "Saving..." : "Finish"} {!saving && <ChevronRight className="w-4 h-4" />}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4">Step 2 of 2</p>
        </div>
      </div>
    );
  }

  return children;
}