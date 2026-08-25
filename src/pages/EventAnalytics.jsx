import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, TrendingUp, Ticket, Tag, Percent, Wallet, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function EventAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const me = await api.auth.me();
    const [events, t, o, p] = await Promise.all([
      api.entities.Event.filter({ id }),
      api.entities.TicketTier.filter({ event_id: id }),
      api.entities.TicketOrder.filter({ event_id: id }),
      api.entities.PromoCode.filter({ event_id: id }),
    ]);
    if (!events.length) return navigate("/");
    if (events[0].host_email !== me.email) return navigate(`/event/${id}`);
    setEvent(events[0]);
    setTiers(t);
    setOrders(o.filter((x) => x.status === "paid"));
    setPromos(p);
    setLoading(false);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  const cur = String(event.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";
  const totalSold = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
  const totalFees = orders.reduce((s, o) => s + Number(o.platform_fee || 0), 0);
  const totalDiscount = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
  const netPayout = orders.reduce((s, o) => s + Number(o.host_net || 0), 0);

  const perTier = tiers.map((t) => {
    const tierOrders = orders.filter((o) => o.tier_id === t.id);
    return {
      ...t,
      sold: tierOrders.length,
      revenue: tierOrders.reduce((s, o) => s + Number(o.paid_amount || 0), 0),
      remaining: Math.max(0, Number(t.quantity || 0) - Number(t.sold || 0)),
    };
  });

  const byDay = {};
  orders.forEach((o) => {
    const d = (o.created_date || "").slice(0, 10);
    byDay[d] = (byDay[d] || 0) + Number(o.paid_amount || 0);
  });
  const days = Object.keys(byDay).sort();
  let running = 0;
  const series = days.map((d) => { running += byDay[d]; return { d, running }; });
  const maxRunning = Math.max(1, ...series.map((s) => s.running));

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Sales Analytics</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{event.title}</p>

      <Link to={`/event/${id}/promoters`} className="block mb-5">
        <Button variant="outline" className="w-full h-11 rounded-xl gap-2 font-semibold">
          <Megaphone className="w-4 h-4" /> Promoters & Commissions
        </Button>
      </Link>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <SummaryCard icon={<Ticket className="w-4 h-4" />} label="Tickets Sold" value={String(totalSold)} />
        <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="Total Revenue" value={`${sym}${totalRevenue.toFixed(2)}`} />
        <SummaryCard icon={<Percent className="w-4 h-4" />} label="Platform Fees" value={`${sym}${totalFees.toFixed(2)}`} />
        <SummaryCard icon={<Wallet className="w-4 h-4" />} label="Net Payout" value={`${sym}${netPayout.toFixed(2)}`} accent="text-emerald-400" />
      </div>

      {/* Sales over time */}
      <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 mb-5">
        <h3 className="font-heading font-semibold text-sm mb-3">Sales Over Time</h3>
        {series.length === 0 ? (
          <p className="text-xs text-muted-foreground">No sales yet.</p>
        ) : (
          <div className="space-y-2">
            {series.map((s) => (
              <div key={s.d}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{s.d}</span>
                  <span>{sym}{s.running.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(s.running / maxRunning) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per tier */}
      <h3 className="font-heading font-semibold text-sm mb-3">Tickets Per Tier</h3>
      <div className="space-y-2 mb-5">
        {perTier.map((t) => (
          <div key={t.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-sm font-bold">{sym}{Number(t.price).toFixed(2)}</p>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t.sold} sold · {t.remaining} left</span>
              <span>{sym}{t.revenue.toFixed(2)} revenue</span>
            </div>
          </div>
        ))}
        {perTier.length === 0 && <p className="text-xs text-muted-foreground">No tiers configured.</p>}
      </div>

      {/* Promo usage */}
      <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2"><Tag className="w-4 h-4" /> Promo Code Usage</h3>
      <div className="space-y-2 mb-5">
        {promos.map((p) => (
          <div key={p.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium font-mono">{p.code}</p>
              <p className="text-xs text-muted-foreground">{p.discount_percent}% off · {p.used_count || 0}/{p.max_uses} used</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{sym}{Number(p.total_discount_given || 0).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">discount given</p>
            </div>
          </div>
        ))}
        {promos.length === 0 && <p className="text-xs text-muted-foreground">No promo codes created.</p>}
      </div>

      {totalDiscount > 0 && (
        <p className="text-xs text-muted-foreground">Total discount given across all codes: {sym}{totalDiscount.toFixed(2)}</p>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, accent = "text-foreground" }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-bold font-heading ${accent}`}>{value}</p>
    </div>
  );
}