import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PhonePrompt({ onSaved }) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!phone.trim()) return;
    setSaving(true);
    await base44.auth.updateMe({ phone: phone.trim() });
    setSaving(false);
    onSaved(phone.trim());
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Phone className="w-4 h-4 text-amber-400" />
        <p className="text-sm font-semibold text-amber-400">Add your phone number</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Hosts can invite or add you as staff using your phone number.
      </p>
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          inputMode="tel"
          className="flex-1 h-10 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <Button size="sm" className="h-10 rounded-xl" onClick={save} disabled={saving || !phone.trim()}>
          {saving ? "..." : "Save"}
        </Button>
      </div>
    </div>
  );
}