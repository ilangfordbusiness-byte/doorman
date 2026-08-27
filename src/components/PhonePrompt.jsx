import { useState } from "react";
import { api } from "@/api/data";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/PhoneInput";
import { normalizePhone } from "@/lib/phone";

export default function PhonePrompt({ onSaved }) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!phone.trim()) return;
    setSaving(true);
    const normalized = normalizePhone(phone);
    await api.auth.updateMe({ phone: normalized });
    setSaving(false);
    onSaved(normalized);
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
        <PhoneInput
          value={phone}
          onChange={setPhone}
          className="flex-1 h-10"
          onEnter={save}
        />
        <Button size="sm" className="h-10 rounded-xl" onClick={save} disabled={saving || !phone.trim()}>
          {saving ? "..." : "Save"}
        </Button>
      </div>
    </div>
  );
}