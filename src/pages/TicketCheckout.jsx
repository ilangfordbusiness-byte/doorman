import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, CreditCard, Tag, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { getStoredRef, captureRef, getLinkDomain, getPromoterByCode, computePromoterDiscount, promoterDiscountActive, discountLabel, usesRemaining, MIN_PAID } from "@/lib/promoterRef";
import CheckoutSuccess from "@/components/checkout/CheckoutSuccess";
import CheckoutCancelled from "@/components/checkout/CheckoutCancelled";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// Standalone checkout page at /event/:id/checkout (and /checkout/:id).
// Guests must be logged into a DoorMan account before buying — if not, they're
// sent to login and returned here with the ref param intact. The ref is also
// carried through the Stripe redirect so promoter attribution survives.
export default function TicketCheckout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");
  const ref = params.get("ref");

  const [authed, setAuthed] = useState(false);
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
  const [promoter, setPromoter] = useState(null);

  // Auth gate — require a DoorMan account before checkout. Return here (with ref)
  // after login so the purchase resumes exactly where they left off.
  useEffect(() => {
    api.auth.isAuthenticated().then((ok) => {
      if (ok) { setAuthed(true); return; }
      api.auth.redirectToLogin(window.location.href);
    });
  }, []);

  // Capture promoter ref on entry (skip on the success screen to avoid a
  // duplicate click being counted after the Stripe redirect).
  useEffect(() => {
    if (ref && payment !== "success") captureRef(id, ref).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  async function load() {
    try {
      const [events, t] = await Promise.all([
        api.entities.Event.filter({ id }),
        api.entities.TicketTier.filter({ event_id: id }),
      ]);
      if (!events.length) { setLoadError("This event is no longer available."); setLoading(false); return; }
      setEvent(events[0]);
      t.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setTiers(t);
      const refCode = ref || getStoredRef(id);
      if (refCode) {
        const p = await getPromoterByCode(id, refCode);
        if (p) setPromoter(p);
      }
    } catch {
      setLoadError("Couldn't load tickets. Please try again.");
    }
    setLoading(false);
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
      const res = await api.functions.invoke("validatePromoCode", { event_id: id, code: promoInput.trim(), tier_id: selected });
      const d = res.data;
      if (!d.valid) setPromoMsg(d.message || "Invalid promo code");
      else { setPromo(d); setPromoMsg(""); toast({ title: "Promo applied" }); }
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
      const base = `${getLinkDomain()}/event/${id}/checkout`;
      const refPart = promoterCode ? `&ref=${promoterCode}` : "";
      const res = await api.functions.invoke("createTicketCheckout", {
        tier_id: tier.id,
        promo_code: promo ? promoInput.trim() : null,
        promoter_code: promoterCode || null,
        success_url: `${base}?payment=success${refPart}`,
        cancel_url: `${base}?payment=cancelled${refPart}`,
      });
      if (res.data?.url) window.location.href = res.data.url;
      else throw new Error(res.data?.error || "Failed to start checkout");
    } catch (e) {
      toast({ title: e.message || "Checkout failed", variant: "destructive" });
      setPaying(false);
    }
  }

  // Confirmation screens render once the auth check has settled.
  if (!authed) return <LoadingSpinner fullScreen />;
  if (payment === "success") return <CheckoutSuccess eventId={id} />;
  if (payment === "cancelled") return <CheckoutCancelled eventId={id} />;
  if (loading) return <LoadingSpinner fullScreen />;
  if (loadError) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-5">{loadError}</p>
      <Button onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
    </div>
  );
  if (!event) return <LoadingSpinner fullScreen />;

  const cur = String(event.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";
  const tier = tiers.find((t) => t.id === selected);
  const unit = tier ? Number(tier.price) : 0;
  const discActive = promoterDiscountActive(promoter);
  const promoterDiscount = discActive ? computePromoterDiscount(unit, promoter).discount : 0;
  const promoDiscount = promo ? unit * (promo.discount_percent / 100) : 0;
  let total = unit - promoterDiscount - promoDiscount;
  if (total < MIN_PAID) total = MIN_PAID;
  if (total > unit) total = unit;
  const discExhausted = !discActive && promoter && promoter.discount_type && promoter.discount_type !== "none" && Number(promoter.discount_value || 0) > 0;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Get Tickets</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{event.title}</p>

      {(discActive || discExhausted) && (
        <div className={`rounded-xl p-3 border text-xs mb-4 ${discActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-secondary/40 border-border/50 text-muted-foreground"}`}>
          {discActive
            ? <>🎉 Promoter discount applied — <span className="font-semibold">{discountLabel(promoter, sym)}</span>{usesRemaining(promoter) !== null ? ` · ${usesRemaining(promoter)} left` : ""}</>
            : "Promo code no longer active — showing full price."}
        </div>
      )}

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
                <div className="text-right">
                  {discActive ? (
                    <>
                      <p className="text-xs text-muted-foreground line-through">{sym}{Number(t.price).toFixed(2)}</p>
                      <p className="text-sm font-bold text-emerald-400">{sym}{computePromoterDiscount(Number(t.price), promoter).paid.toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold">{sym}{Number(t.price).toFixed(2)}</p>
                  )}
                </div>
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
            {discActive && promoterDiscount > 0 && <div className="flex justify-between text-emerald-400"><span>Promoter discount</span><span>-{sym}{promoterDiscount.toFixed(2)}</span></div>}
            {promo && <div className="flex justify-between text-emerald-400"><span>Promo ({promo.discount_percent}%)</span><span>-{sym}{promoDiscount.toFixed(2)}</span></div>}
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