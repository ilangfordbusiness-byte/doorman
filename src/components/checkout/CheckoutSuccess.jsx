import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/data";
import { Ticket, QrCode, CheckCircle2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// Confirmation screen shown after a successful Stripe Checkout redirect.
// Polls for the paid order (webhook may still be processing) then shows the
// ticket details, promoter attribution, and a link to the guest's QR pass.
export default function CheckoutSuccess({ eventId }) {
  const [order, setOrder] = useState(null);
  const [event, setEvent] = useState(null);
  const [promoter, setPromoter] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let active = true;
    async function poll() {
      let me = null;
      try {
        me = await api.auth.me();
      } catch {
        // Session expired mid-flow — send back through login, preserving this URL.
        api.auth.redirectToLogin(window.location.href);
        return;
      }
      const evts = await api.entities.Event.filter({ id: eventId }).catch(() => []);
      if (active) setEvent(evts[0] || null);
      for (let i = 0; i < 12; i++) {
        const orders = await api.entities.TicketOrder
          .filter({ event_id: eventId, guest_email: me.email, status: "paid" })
          .catch(() => []);
        const paid = orders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
        if (paid) {
          if (active) { setOrder(paid); setPolling(false); }
          if (paid.promoter_id) {
            const p = await api.entities.Promoter.filter({ id: paid.promoter_id }).catch(() => []);
            if (active) setPromoter(p[0] || null);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (active) setPolling(false);
    }
    poll();
    return () => { active = false; };
  }, [eventId]);

  const cur = String(event?.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";

  if (polling && !order) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <LoadingSpinner />
        <p className="text-sm text-muted-foreground mt-4">Issuing your ticket…</p>
        <p className="text-xs text-muted-foreground mt-1">Confirming payment with our secure provider.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-12 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-9 h-9 text-emerald-400" />
      </div>
      <h1 className="font-heading font-bold text-2xl mb-1">You're on the list!</h1>
      <p className="text-sm text-muted-foreground mb-6">{event?.title}</p>

      <div className="bg-card rounded-2xl border border-border p-5 text-left mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="w-4 h-4 text-primary" />
          <p className="font-heading font-semibold">{order?.tier_name || "Ticket"}</p>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{order?.quantity || 1}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total paid</span><span className="font-bold">{sym}{Number(order?.paid_amount || 0).toFixed(2)}</span></div>
          {order?.promo_code && <div className="flex justify-between text-emerald-400"><span>Promo applied</span><span>{order.promo_code}</span></div>}
        </div>
        {promoter && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="w-3.5 h-3.5" /> Referred by {promoter.name}
          </div>
        )}
      </div>

      <Link to={`/pass/${eventId}`}>
        <Button className="w-full h-14 rounded-xl font-bold text-base gap-2"><QrCode className="w-5 h-5" /> Open my QR Pass</Button>
      </Link>
      <p className="text-xs text-muted-foreground mt-4">Show this at the door for entry.</p>
    </div>
  );
}