import { currencySymbol } from "@/lib/money";
import { useState, useEffect } from "react";
import { tierRemaining } from "@/lib/tiers";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "@/api/data";
import { isNative, openInAppBrowser } from "@/lib/native";
import NativeCheckoutWait from "@/components/checkout/NativeCheckoutWait";
import { ArrowLeft, CreditCard, Tag, Loader2, AlertCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import HomeButton from "@/components/HomeButton";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { getStoredRef, captureRef, getLinkDomain, getPromoterByCode, computePromoterDiscount, promoterDiscountActive, discountLabel, usesRemaining, MIN_PAID } from "@/lib/promoterRef";
import { bookingFee } from "@/lib/fees";
import CheckoutSuccess from "@/components/checkout/CheckoutSuccess";
import CheckoutCancelled from "@/components/checkout/CheckoutCancelled";
import { loadPixel, trackPixel, metaMatchKeys } from "@/lib/metaPixel";

// Standalone checkout page at /event/:id/checkout (and /checkout/:id).
// Guests must be logged into a DoorMan account before buying — if not, they're
// sent to login and returned here with the ref param intact. The ref is also
// carried through the Stripe redirect so promoter attribution survives.
export default function TicketCheckout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  // From the router (not window.location) so the iOS app's deep-link
  // navigation back to ?payment=… re-renders this page in place.
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const payment = params.get("payment");
  const ref = params.get("ref");
  const orderParam = params.get("order");
  // iOS: the order we opened in the Stripe sheet, while we wait for it to pay.
  const [pendingOrder, setPendingOrder] = useState(null);

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
    }).catch(() => api.auth.redirectToLogin(window.location.href));
  }, []);

  // Capture promoter ref on entry (skip on the success screen to avoid a
  // duplicate click being counted after the Stripe redirect).
  useEffect(() => {
    if (ref && payment !== "success") captureRef(id, ref).catch(() => {});
    // Backed out of Stripe: free the seats this checkout was holding.
    if (payment === "cancelled" && orderParam) {
      api.functions.invoke("cancelTicketCheckout", { order_id: orderParam }).catch(() => {});
    }
  }, [id, payment, orderParam]);

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  // Organiser ad tracking: the business's own Meta Pixel on its checkout.
  useEffect(() => {
    if (event?.meta_pixel_id && !payment) loadPixel(event.meta_pixel_id);
  }, [event?.meta_pixel_id]);

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

  const remaining = tierRemaining;

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
      const path = `/event/${id}/checkout`;
      const base = `${getLinkDomain()}${path}`;
      const refPart = promoterCode ? `&ref=${promoterCode}` : "";
      // iOS: Stripe runs in a browser sheet that cannot land on the app's own
      // origin, so it redirects to /native/return on the public site, which
      // hands the user back through the doorman:// scheme with `to` = the
      // in-app path (the server appends order=<id>).
      const native = isNative();
      const returnFor = (status) =>
        `${getLinkDomain()}/native/return?status=${status}&to=${encodeURIComponent(`${path}?payment=${status}${refPart}`)}`;
      if (event.meta_pixel_id) {
        trackPixel(event.meta_pixel_id, "InitiateCheckout", {
          value: totalDue, currency: cur.toUpperCase(),
          content_ids: [tier.id], content_type: "product", num_items: 1,
        });
      }
      const res = await api.functions.invoke("createTicketCheckout", {
        tier_id: tier.id,
        promo_code: promo ? promoInput.trim() : null,
        promoter_code: promoterCode || null,
        success_url: native ? returnFor("success") : `${base}?payment=success${refPart}`,
        cancel_url: native ? returnFor("cancelled") : `${base}?payment=cancelled${refPart}`,
        // Browser match keys for the server-side Purchase (ignored unless the
        // event's business has Meta tracking configured).
        tracking: event.meta_pixel_id ? metaMatchKeys() : null,
      });
      if (!res.data?.url) throw new Error(res.data?.error || "Failed to start checkout");
      if (native) {
        setPendingOrder(res.data.order_id);
        setPaying(false);
      }
      await openInAppBrowser(res.data.url);
    } catch (e) {
      toast({ title: e.message || "Checkout failed", variant: "destructive" });
      setPaying(false);
    }
  }

  // Confirmation screens render once the auth check has settled.
  if (!authed) return <LoadingSpinner fullScreen />;
  if (payment === "success") return <CheckoutSuccess eventId={id} orderId={orderParam} />;
  if (payment === "cancelled") return <CheckoutCancelled eventId={id} />;
  if (pendingOrder) {
    const refQ = getStoredRef(id) ? `&ref=${getStoredRef(id)}` : "";
    return (
      <NativeCheckoutWait
        orderId={pendingOrder}
        onPaid={() => { setPendingOrder(null); navigate(`/event/${id}/checkout?payment=success&order=${pendingOrder}${refQ}`, { replace: true }); }}
        onCancelled={() => { setPendingOrder(null); navigate(`/event/${id}/checkout?payment=cancelled&order=${pendingOrder}${refQ}`, { replace: true }); }}
      />
    );
  }
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
  const sym = currencySymbol(cur);
  const tier = tiers.find((t) => t.id === selected);
  const unit = tier ? Number(tier.price) : 0;
  const discActive = promoterDiscountActive(promoter);
  const promoterDiscount = discActive ? computePromoterDiscount(unit, promoter).discount : 0;
  const promoDiscount = promo ? unit * (promo.discount_percent / 100) : 0;
  let total = unit - promoterDiscount - promoDiscount;
  if (total < MIN_PAID) total = MIN_PAID;
  if (total > unit) total = unit;
  const discExhausted = !discActive && promoter && promoter.discount_type && promoter.discount_type !== "none" && Number(promoter.discount_value || 0) > 0;
  // Tickets are shown at the host's set (face) price while browsing; under
  // pass_on the booking fee is added as its own line in the summary below (the
  // server recomputes it on the discounted face value).
  const passOn = event.fee_mode === "pass_on";
  const fee = passOn ? bookingFee(total) : 0;
  const totalDue = total + fee;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl flex-1">Get Tickets</h1>
        <HomeButton />
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
          const soldOut = left <= 0 || t.sales_status !== "open";
          return (
            <button
              key={t.id}
              onClick={() => { setSelected(t.id); setPromo(null); setPromoMsg(""); setPromoInput(""); }}
              disabled={soldOut}
              className={`w-full text-left rounded-xl p-3 border transition-colors ${selected === t.id ? "border-primary bg-primary/10" : "border-border bg-secondary/40"} ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className={`text-sm font-semibold ${soldOut ? "line-through" : ""}`}>{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground whitespace-pre-line break-words">{t.description}</p>}
                  {soldOut && <p className="text-xs text-muted-foreground">Sold out</p>}
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
            {passOn && <div className="flex justify-between"><span className="text-muted-foreground">Booking fee</span><span>{sym}{fee.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold pt-1.5 border-t border-border/50">
              <span className="inline-flex items-center gap-1">
                Total
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger type="button" className="cursor-help text-muted-foreground inline-flex" aria-label="Refund policy">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>No refunds — all ticket sales are final.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <span>{sym}{totalDue.toFixed(2)}</span>
            </div>
          </div>

          <Button className="w-full h-14 rounded-xl font-bold text-base gap-2" onClick={pay} disabled={paying}>
            {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CreditCard className="w-5 h-5" /> Pay {sym}{totalDue.toFixed(2)}</>}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Secure card payment via Stripe. You'll receive a QR pass after payment.</p>
        </div>
      )}
    </div>
  );
}