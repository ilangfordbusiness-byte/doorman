import { useEffect, useState } from "react";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { BarChart3, Loader2, ShieldCheck } from "lucide-react";

// Meta ads tracking for a business account: its own Pixel ID (loaded on its
// event + checkout pages) and a Conversions API access token (used by the
// server to report ticket sales). The token is write-only — the API only
// tells us whether one is saved — so the field is always blank and a new
// value replaces the old one.
export default function MetaTrackingSection({ businessId }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [token, setToken] = useState("");
  const [tokenSet, setTokenSet] = useState(false);
  const [testCode, setTestCode] = useState("");

  useEffect(() => {
    let active = true;
    api.entities.BusinessAccount.filter({ id: businessId }).then((list) => {
      if (!active) return;
      const b = list[0];
      if (b) {
        setPixelId(b.meta_pixel_id || "");
        setTokenSet(!!b.meta_capi_token_set);
        setTestCode(b.meta_test_event_code || "");
      }
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, [businessId]);

  async function save({ clearToken = false } = {}) {
    const pid = pixelId.trim();
    if (pid && !/^\d{5,20}$/.test(pid)) {
      toast({ title: "Pixel ID should be the number from Events Manager", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const patch = { meta_pixel_id: pid, meta_test_event_code: testCode.trim() };
      if (clearToken) patch.meta_capi_token = "";
      else if (token.trim()) patch.meta_capi_token = token.trim();
      await api.entities.BusinessAccount.update(businessId, patch);
      if (clearToken) setTokenSet(false);
      else if (token.trim()) setTokenSet(true);
      setToken("");
      toast({ title: clearToken ? "Access token removed" : "Meta tracking saved" });
    } catch (e) {
      toast({ title: e?.message || "Couldn't save", variant: "destructive" });
    }
    setSaving(false);
  }

  if (loading) return <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h2 className="font-heading font-bold text-base">Meta ads tracking</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Running Facebook or Instagram ads? Add your Pixel and DoorMan will report page views, checkouts and ticket
        sales for your events to your ad account. Find both values in Meta Events Manager → Data sources → Settings.
      </p>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Pixel ID (Dataset ID)</Label>
          <Input inputMode="numeric" value={pixelId} onChange={(e) => setPixelId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 123456789012345" className="bg-secondary/50 border-border h-11 rounded-xl" />
          <p className="text-[11px] text-muted-foreground mt-1">Loads your pixel on this business's event and checkout pages only.</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Conversions API access token</Label>
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenSet ? "Saved — paste a new token to replace it" : "Paste the token from Events Manager"} className="bg-secondary/50 border-border h-11 rounded-xl" />
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {tokenSet ? <><ShieldCheck className="w-3 h-3 text-emerald-400" /> Token saved. Purchases are also reported server-side.</> : "Optional but recommended: reports sales even when the browser blocks the pixel."}
            </p>
            {tokenSet && (
              <button type="button" className="text-[11px] text-destructive underline-offset-2 hover:underline" disabled={saving} onClick={() => save({ clearToken: true })}>
                Remove
              </button>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Test event code <span className="normal-case text-muted-foreground/70">(optional)</span></Label>
          <Input value={testCode} onChange={(e) => setTestCode(e.target.value.toUpperCase())} placeholder="TEST12345" className="bg-secondary/50 border-border h-11 rounded-xl" />
          <p className="text-[11px] text-muted-foreground mt-1">From the Test events tab. Set it while checking your setup, then clear it so real sales count.</p>
        </div>
      </div>

      <Button className="w-full h-11 rounded-xl mt-4" variant="outline" disabled={saving} onClick={() => save()}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save tracking settings
      </Button>
    </div>
  );
}
