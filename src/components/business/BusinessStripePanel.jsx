import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { CreditCard, Wallet, ExternalLink, CheckCircle2, AlertCircle, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

function inIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

export default function BusinessStripePanel({ business }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(null);
  const [balances, setBalances] = useState([]);

  async function load() {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await api.functions.invoke("stripeConnect", { action: "business_status", business_id: business.id });
      setAccount(res.data?.account || null);
      setBalances(res.data?.balances || []);
    } catch (e) {
      console.error("business stripe status failed", e);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [business?.id]);

  async function handleConnect() {
    if (inIframe()) {
      toast({ title: "Open the published app", description: "Stripe onboarding only works on the published app, not in the preview.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api.functions.invoke("stripeConnect", { action: "business_onboard", business_id: business.id });
      if (res.data?.url) window.location.href = res.data.url;
      else if (res.data?.error) throw new Error(res.data.error);
    } catch (e) {
      toast({ title: "Couldn't start Stripe onboarding", description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function handleDashboard() {
    if (inIframe()) {
      toast({ title: "Open the published app", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api.functions.invoke("stripeConnect", { action: "business_dashboard_link", business_id: business.id });
      if (res.data?.url) window.location.href = res.data.url;
      else if (res.data?.error) throw new Error(res.data.error);
    } catch (e) {
      toast({ title: "Couldn't open Stripe dashboard", description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading business payouts…
      </div>
    );
  }

  const connected = !!account?.id;
  const active = account?.payouts_enabled;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-4">
      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-1">
        <CreditCard className="w-4 h-4" /> Business Payouts
      </h3>
      <p className="text-xs text-muted-foreground mb-3">This business's ticket payouts go to your personal Stripe account.</p>

      {!connected ? (
        <div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Connect your personal Stripe account to receive this business's payouts to your own bank.
          </p>
          <div className="space-y-2">
            <Button className="w-full rounded-xl" disabled={busy} onClick={handleConnect}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              Connect existing account
            </Button>
            <Button variant="outline" className="w-full rounded-xl gap-2" onClick={() => window.open("https://dashboard.stripe.com/register", "_blank", "noopener,noreferrer")}>
              <UserPlus className="w-4 h-4" /> Sign up to create one
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
            {active ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="flex-1">{active ? "Stripe account active — payouts enabled" : "Finish setup in Stripe to enable payouts"}</span>
          </div>

          {balances.length === 0 && <p className="text-xs text-muted-foreground">No earnings recorded yet. Earnings appear here once tickets are sold.</p>}

          {balances.map((b) => {
            const sym = SYMBOL[b.currency] || "";
            return (
              <div key={b.key} className="bg-secondary/40 rounded-xl border border-border/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Host earnings · {b.currency.toUpperCase()}</span>
                  <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold font-heading text-emerald-400">{sym}{b.earned.toFixed(2)}</p>
              </div>
            );
          })}

          <Button variant="outline" className="w-full rounded-xl gap-2" disabled={busy} onClick={handleDashboard}>
            <ExternalLink className="w-4 h-4" /> Manage Payouts & Bank Details
          </Button>
        </div>
      )}
    </div>
  );
}