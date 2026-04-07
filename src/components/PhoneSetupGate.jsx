import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PhoneSetupGate({ children }) {
  const [checked, setChecked] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.me().then((me) => {
      if (me && !me.phone) {
        setNeedsPhone(true);
      }
      setChecked(true);
    });
  }, []);

  async function save() {
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    setSaving(true);
    await base44.auth.updateMe({ phone: phone.trim() });
    setNeedsPhone(false);
  }

  if (!checked) return null;

  if (needsPhone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-5 mx-auto">
            <Phone className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-center mb-1">One last step</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Add your phone number so hosts can invite you or add you as staff by phone.
          </p>
          <div className="space-y-3">
            <input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(""); }}
              placeholder="+1 (555) 000-0000"
              inputMode="tel"
              className="w-full h-12 px-4 text-base bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              className="w-full h-12 rounded-xl font-bold text-base"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}