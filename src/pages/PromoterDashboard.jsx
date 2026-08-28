import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Ticket, TrendingUp, Wallet, MousePointerClick, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomeButton from "@/components/HomeButton";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useStripeStatus } from "@/hooks/useStripeStatus";
import { discountLabel, usesRemaining } from "@/lib/promoterRef";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// Promoter-facing dashboard. Reachable by anyone with the tracking code,
// updated in real time via TicketOrder subscriptions.
export default function PromoterDashboard() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [promoter, setPromoter] = useState(null);
  const [event, setEvent] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const { connected: stripeConnected, active: stripeActive } = useStripeStatus();

  useEffect(() => {
    load();
    const unsubOrders = api.entities.TicketOrder.subscribe(() => { load(); });
    const unsubProms = api.entities.Promoter.subscribe(() => { load(); });
    return () => {
      if (typeof unsubOrders === "function") unsubOrders();
      if (typeof unsubProms === "function") unsubProms();
    };
  }, [code]);

  async function load() {
    try {
      const proms = await api.entities.Promoter.filter({ tracking_code: code });
      if (!proms.length) { setLoading(false); return; }
      const p = proms[0];
      setPromoter(p);
      try {
        const me = await api.auth.me();
        if (me?.email && p.email && me.email.toLowerCase() === p.email.toLowerCase()) setIsOwner(true);
      } catch {}
      const [events, ords] = await Promise.all([
        api.entities.Event.filter({ id: p.event_id }),
        api.entities.TicketOrder.filter({ promoter_id: p.id, status: "paid" }),
      ]);
      setEvent(events[0] || null);
      setOrders(ords);
    } catch {}
    setLoading(false);
  }

  if (loading) return <LoadingSpinner fullScreen />;
  if (!promoter) return (
    <div className="max-w-lg mx-auto px-4 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Promoter link not found.</p>
      <Button className="mt-4" onClick={() => navigate("/")}>Go home</Button>
    </div>
  );

  const cur = String(event?.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";
  const ticketsSold = orders.length;
  const totalSales = orders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
  const commissionEarned = orders.reduce((s, o) => s + Number(o.commission_amount || 0), 0);
  const rate = promoter.commission_type === "flat"
    ? `${sym}${Number(promoter.commission_value).toFixed(2)} / ticket`
    : `${promoter.commission_value}% per ticket`;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl flex-1">Promoter Dashboard</h1>
        <HomeButton />
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 mb-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Promoter</p>
        <p className="font-heading font-bold text-lg">{promoter.name}</p>
        {event && <p className="text-sm text-muted-foreground">{event.title}</p>}
        <p className="text-[11px] text-muted-foreground mt-1">Commission: {rate}</p>
        {(() => {
          const label = discountLabel(promoter, sym);
          const rem = usesRemaining(promoter);
          const used = Number(promoter.discount_used_count || 0);
          if (!label) return <p className="text-[11px] text-muted-foreground mt-0.5">Guest discount: None</p>;
          return (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Guest discount: <span className="text-emerald-400 font-medium">{label}</span>
              {" · "}{used} used{rem !== null ? ` · ${rem} left` : " · ∞"}
            </p>
          );
        })()}
      </div>

      {isOwner && stripeConnected !== null && !stripeActive && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 mb-4 text-amber-400">
          <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            Commissions are paid automatically every Monday — finish your Stripe setup to
            receive them.{" "}
            <Link to="/profile" className="underline font-semibold">Set up payouts in your Profile</Link>.
            Your earnings keep accruing until then.
          </div>
        </div>
      )}
      {isOwner && stripeActive && (
        <p className="text-[11px] text-muted-foreground mb-4">
          Commissions are paid to your Stripe account every Monday for events that have
          finished, once you're over {sym}10.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat icon={<Ticket className="w-4 h-4" />} label="Tickets Sold" value={String(ticketsSold)} />
        <Stat icon={<MousePointerClick className="w-4 h-4" />} label="Link Clicks" value={String(Number(promoter.clicks || 0))} />
        <Stat icon={<TrendingUp className="w-4 h-4" />} label="Total Sales" value={`${sym}${totalSales.toFixed(2)}`} />
        <Stat icon={<Wallet className="w-4 h-4" />} label="Commission" value={`${sym}${commissionEarned.toFixed(2)}`} accent="text-amber-400" />
      </div>
      <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
        Tip: open your tracking link in a new session to register a test click, then buy a ticket to confirm it appears under Recent Sales.
      </p>

      <h3 className="font-heading font-semibold text-sm mb-3">Recent Sales</h3>
      <div className="space-y-2">
        {orders.length === 0 && (
          <p className="text-xs text-muted-foreground">No sales through your link yet — share it to start earning.</p>
        )}
        {orders.slice(0, 20).map((o) => (
          <div key={o.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50 flex justify-between items-center text-sm">
            <div>
              <p className="font-medium">{o.tier_name}</p>
              <p className="text-[11px] text-muted-foreground">{(o.created_date || "").slice(0, 10)}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">{sym}{Number(o.paid_amount).toFixed(2)}</p>
              <p className="text-[11px] text-amber-400">+{sym}{Number(o.commission_amount || 0).toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent = "text-foreground" }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-3 border border-border/50 text-center">
      <div className="flex items-center justify-center text-muted-foreground mb-1">{icon}</div>
      <p className={`text-lg font-bold font-heading ${accent}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}