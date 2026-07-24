import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CreditCard, Tag, Loader2, CheckCircle2, XCircle, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { getStoredRef, captureRef, getLinkDomain } from "@/lib/promoterRef";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function TicketCheckout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payment, setPayment] = useState(null); // "success" | "cancelled" | null
  const [confirmOrder, setConfirmOrder] = useState(null);
  const [confirmEntry, setConfirmEntry] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) captureRef(id, ref).catch(() => {});
    setPayment(params.get("payment"));
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  async function load() {
    try {
      const [events, t] = await Promise.all([
        base44.entities.Event.filter({ id }),
        base44.entities.TicketTier.filter({ event_id: id }),
      ]);
      if (!events.length) { setLoadError("This event isn't available right now."); setLoading(false); return; }
      setEvent(events[0]);
      t.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setTiers(t);
      if (new URLSearchParams(window.location.search).get("payment") === "success") startConfirmPoll();
    } catch {
      setLoadError("Couldn't load this event's tickets.");
    }
    setLoading(false);
  }

  // After Stripe success: poll for the paid order and the issued guestlist entry.
  async function startConfirmPoll() {
    setIssuing(true);
    const me = await base44.auth.me().catch(() => null);
    if (!me) { setIssuing(false); return; }
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const [orders, entries] = await Promise.all([
          base44.entities.TicketOrder.filter({ event_id: id, guest_email: me.email, status: "paid" }),
          base44.entities.GuestlistEntry.filter({ event_id: id, guest_email: me.email }),
        ]);
        const latest = orders.sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
        if (latest) setConfirmOrder(latest);
        const entry = entries.find((e) => ["approved", "checked_in"].includes(e.status));
        if (entry) setConfirmEntry(entry);
        if (entry || tries > 12) { setIssuing(false); if (pollRef.current) clearInterval(pollRef.current); }
      } catch {}
    };
    await tick();
    pollRef.current = setInterval(tick, 2000);
  }

  function remaining(t) {
    return Math.max(0, Number(t.quantity || 0) - Number(t.sold || 0));
  }

  async function applyPromo() {
    if (!selected || !promoInput.trim()) return;
    setApplyingPromo(true);
    setPromoMsg("");
    setPromo(null);
    try {
      const res = await base44.functions.invoke("validatePromoCode", { event_id: id, code: promoInput.trim(), tier_id: selected });
      const d = res.data;
      if (!d.valid) {
        setPromoMsg(d.message || "Invalid promo code");
      } else {
        setPromo(d);
        setPromoMsg("");
        toast({ title: "Promo applied" });
      }
    } catch {
      setPromoMsg("Could not validate code");
    }
    setApplyingPromo(false);
  }

  async function pay() {
    const tier = tiers.find((t) => t.id === selected);
    if (!tier) return;
    if (window.self !== window.top) {
      toast({ title: "Checkout works only on the published app", description: "Open the app in a new tab to pay.", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const promoterCode = getStoredRef(id);
      const domain = getLinkDomain();
      const res = await base44.functions.invoke("createTicketCheckout", {
        tier_id: tier.id,
        promo_code: promo ? promoInput.trim() : null,
        promoter_code: promoterCode || null,
        success_url: `${domain}/checkout/${id}?payment=success`,
        cancel_url: `${domain}/checkout/${id}?payment=cancelled`,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error(res.data?.error || "Failed to start checkout");
      }
    } catch (e) {
      toast({ title: e.message || "Checkout failed", variant: "destructive" });
      setPaying(false);
    }
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (loadError) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
      <h2 className="font-heading font-bold text-lg mb-2">Tickets unavailable</h2>
      <p className="text-sm text-muted-foreground mb-6">{loadError}</p>
      <Button onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
    </div>
  );

  if (!event) return null;

  const cur = String(event.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";

  // ---- Confirmation screen ----
  if (payment === "success") {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8">
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <h1 className="font-heading font-bold text-xl mb-1">Payment successful</h1>
          <p className="text-sm text-muted-foreground mb-5">{event.title}</p>
          {confirmOrder ? (
            <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 text-left space-y-1.5 text-sm mb-5">
              <div className="flex justify-between"><span className="text-muted-foreground">Ticket</span><span className="font-medium">{confirmOrder.tier_name} ×{confirmOrder.quantity || 1}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-medium">{sym}{Number(confirmOrder.paid_amount).toFixed(2)}</span></div>
              {confirmOrder.promo_code && <div className="flex justify-between text-emerald-400"><span>Promo</span><span>{confirmOrder.promo_code}</span></div>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mb-5">Confirming your order…</p>
          )}
          {confirmEntry ? (
            <Link to={`/pass/${id}`}>
              <Button className="w-full h-12 rounded-xl font-bold gap-2 mb-2"><QrCode className="w-5 h-5" /> Open my QR Pass</Button>
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground mb-4">{issuing ? "Issuing your pass — one moment…" : "Your pass is being issued. Check the app shortly."}</p>
          )}
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
        </div>
      </div>
    );
  }

  // ---- Cancel screen ----
  if (payment === "cancelled") {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8">
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-9 h-9 text-destructive" />
          </div>
          <h1 className="font-heading font-bold text-xl mb-1">Payment cancelled</h1>
          <p className="text-sm text-muted-foreground mb-5">Your card wasn't charged. You can try again.</p>
          <Button className="w-full h-12 rounded-xl font-bold mb-2" onClick={() => { setPayment(null); navigate(`/checkout/${id}`, { replace: true }); }}>Try again</Button>
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
        </div>
      </div>
    );
  }

  // ---- Checkout form ----
  const tier = tiers.find((t) => t.id === selected);
  const unit = tier ? Number(tier.price) : 0;
  const discount = promo ? unit * (promo.discount_percent / 100) : 0;
  const total = Math.max(0, unit - discount);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Get Tickets</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{event.title}</p>

      <div className="space-y-2 mb-5">
        {tiers.map((t) => {
          const left = remaining(t);
          const soldOut = left <= 0;
          return (
            <button
              key={t.id}
              onClick={() => { setSelected(t.id); setPromo(null); setPromoMsg(""); setPromoInput(""); }}
              disabled={soldOut}
              className={`w-full text-left rounded-xl p-3 border transition-colors ${selected === t.id ? "border-primary bg-primary/10" : "border-border bg-secondary/40"} ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{soldOut ? "Sold out" : `${left} left`}</p>
                </div>
                <p className="text-sm font-bold">{sym}{Number(t.price).toFixed(2)}</p>
              </div>
            </button>
          );
        })}
        {tiers.length === 0 && <p className="text-xs text-muted-foreground">No tickets available for this event.</p>}
      </div>

      {selected && (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Promo Code</p>
            <div className="flex gap-2">
              <Input placeholder="Enter code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} className="h-10" />
              <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={applyPromo} disabled={applyingPromo}>
                {applyingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoMsg && <p className="text-xs text-destructive mt-1.5">{promoMsg}</p>}
            {promo && <p className="text-xs text-emerald-400 mt-1.5">✓ {promo.discount_percent}% off applied</p>}
          </div>

          <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Ticket ({tier?.name})</span><span>{sym}{unit.toFixed(2)}</span></div>
            {promo && <div className="flex justify-between text-emerald-400"><span>Discount ({promo.discount_percent}%)</span><span>-{sym}{discount.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold pt-1.5 border-t border-border/50"><span>Total</span><span>{sym}{total.toFixed(2)}</span></div>
          </div>

          <Button className="w-full h-14 rounded-xl font-bold text-base gap-2" onClick={pay} disabled={paying}>
            {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CreditCard className="w-5 h-5" /> Pay {sym}{total.toFixed(2)}</>}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Secure card payment via Stripe. You'll receive a QR pass after payment.</p>
        </div>
      )}
    </div>
  );
}