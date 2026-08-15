import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CreditCard, Wallet, ArrowDownToLine, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

function inIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

export default function StripeConnectPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(null);
  const [balances, setBalances] = useState([]);
  const [withdraw, setWithdraw] = useState({});

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("stripeConnect", { action: "status" });
      setAccount(res.data?.account || null);
      setBalances(res.data?.balances || []);
    } catch (e) {
      console.error("stripe status failed", e);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleConnect() {
    if (inIframe()) {
      toast({ title: "Open the published app", description: "Stripe onboarding only works on the published app, not in the preview.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("stripeConnect", { action: "onboard" });
      if (res.data?.url) window.location.href = res.data.url;
      else if (res.data?.error) throw new Error(res.data.error);
    } catch (e) {
      toast({ title: "Couldn't start Stripe onboarding", description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function handleDashboard() {
    if (inIframe()) {
      toast({ title: "Open the published app", description: "The Stripe dashboard only works on the published app.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("stripeConnect", { action: "dashboard_link" });
      if (res.data?.url) window.location.href = res.data.url;
      else if (res.data?.error) throw new Error(res.data.error);
    } catch (e) {
      toast({ title: "Couldn't open Stripe dashboard", description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function handleWithdraw(b) {
    const amt = Number(withdraw[b.key] || 0);
    if (!amt || amt <= 0) { toast({ title: "Enter an amount to withdraw" }); return; }
    if (amt > b.available) { toast({ title: "Amount exceeds available balance", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("stripeConnect", {
        action: "withdraw",
        amount: amt,
        currency: b.currency,
        role: b.role,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setWithdraw((s) => ({ ...s, [b.key]: "" }));
      setBalances(res.data?.balances || []);
      toast({ title: "Withdrawal initiated", description: "Funds are on the way to your Stripe account." });
    } catch (e) {
      toast({ title: "Withdrawal failed", description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading payouts…
      </div>
    );
  }

  const connected = !!account?.id;
  const active = account?.payouts_enabled;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-4">
      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <CreditCard className="w-4 h-4" /> Payouts & Earnings
      </h3>

      {!connected ? (
        <div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Connect a Stripe account to receive your host and promoter earnings directly to your bank. Stripe handles identity verification and payouts.
          </p>
          <Button className="w-full rounded-xl" disabled={busy} onClick={handleConnect}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Connect Stripe
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
            {active ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="flex-1">{active ? "Stripe account active — payouts enabled" : "Finish setup in Stripe to enable payouts"}</span>
          </div>

          {balances.length === 0 && (
            <p className="text-xs text-muted-foreground">No earnings recorded yet. Earnings appear here once tickets are sold.</p>
          )}

          {balances.map((b) => {
            const sym = SYMBOL[b.currency] || "";
            return (
              <div key={b.key} className="bg-secondary/40 rounded-xl border border-border/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {b.role === "promoter" ? "Promoter earnings" : "Host earnings"} · {b.currency.toUpperCase()}
                  </span>
                  <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <p className="text-sm font-bold">{sym}{b.earned.toFixed(2)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Earned</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-muted-foreground">{sym}{b.withdrawn.toFixed(2)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Withdrawn</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-400">{sym}{b.available.toFixed(2)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Available</p>
                  </div>
                </div>
                {active && b.available > 0 && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={b.available.toFixed(2)}
                      value={withdraw[b.key] || ""}
                      onChange={(e) => setWithdraw((s) => ({ ...s, [b.key]: e.target.value }))}
                      className="h-9 bg-secondary/50 border-border rounded-lg flex-1"
                    />
                    <Button size="sm" className="rounded-lg" disabled={busy} onClick={() => handleWithdraw(b)}>
                      <ArrowDownToLine className="w-3.5 h-3.5 mr-1" /> Withdraw
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={handleDashboard}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-lg py-2"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Stripe dashboard
          </button>
        </div>
      )}
    </div>
  );
}