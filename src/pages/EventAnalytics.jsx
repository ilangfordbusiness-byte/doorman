import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import {
  ArrowLeft, Ticket, Tag, Wallet, Megaphone, Download, Clock, Target,
  DoorOpen, TrendingUp, Trophy,
} from "lucide-react";
import { api } from "@/api/data";
import { currencySymbol } from "@/lib/money";
import { tierRemaining } from "@/lib/tiers";
import { eventZone } from "@/lib/eventTime";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import HomeButton from "@/components/HomeButton";
import LoadingSpinner from "@/components/LoadingSpinner";
import { buildEventExportCsv } from "@/lib/eventExport";
import { downloadCsv, slugForFilename } from "@/lib/csv";
import { CHART, Card, StatTile, Ring, MeterBar, TooltipCard, EmptyNote } from "@/components/analytics/ChartKit";

const GOING = new Set(["approved", "checked_in", "invited"]);
const DAY_MS = 86400000;

const hourLabel = (h) => {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h < 12 ? "am" : "pm"}`;
};

// Hour-of-day (0–23) that an ISO timestamp falls in, in the event's own zone.
function hourInZone(iso, tz) {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(iso));
    return parseInt(h, 10) % 24;
  } catch {
    return new Date(iso).getHours();
  }
}

// "9:45pm" in the event's zone — for the door check-in timeline axis.
function clockInZone(ms, tz) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
      .format(new Date(ms)).replace(/\s/g, "").toLowerCase();
  } catch {
    return "";
  }
}

const shortDay = (iso) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export default function EventAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [promos, setPromos] = useState([]);
  const [promoters, setPromoters] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [salesMetric, setSalesMetric] = useState("tickets"); // 'tickets' | 'revenue'

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [events, t, o, p, pr, g] = await Promise.all([
        api.entities.Event.filter({ id }),
        api.entities.TicketTier.filter({ event_id: id }),
        api.entities.TicketOrder.filter({ event_id: id }),
        api.entities.PromoCode.filter({ event_id: id }),
        api.entities.Promoter.filter({ event_id: id }),
        api.entities.GuestlistEntry.filter({ event_id: id }, "-created_date"),
      ]);
      if (!events.length) return navigate("/");
      if (!events[0].can_manage) return navigate(`/event/${id}`);
      setEvent(events[0]);
      setTiers(t);
      setAllOrders(o);
      setPromos(p);
      setPromoters(pr);
      setGuests(g);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Everything on this page plus the guestlist and promoter tables, as one CSV
  // built client-side from data the host can already read via the api layer.
  async function exportCsv() {
    setExporting(true);
    try {
      const csv = buildEventExportCsv({
        event, tiers, orders: allOrders, promos, promoters,
        guests: [...guests].sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || ""))),
      });
      const day = new Date().toISOString().slice(0, 10);
      await downloadCsv(`${slugForFilename(event.title)}-export-${day}.csv`, csv);
    } catch (e) {
      console.error(e);
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const cur = String(event?.currency || "gbp").toLowerCase();
  const sym = currencySymbol(cur);
  const fmtMoney = (n) => `${sym}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtMoneyShort = (n) => {
    const v = Number(n) || 0;
    return v >= 1000 ? `${sym}${(v / 1000).toFixed(1)}k` : `${sym}${Math.round(v)}`;
  };

  const orders = useMemo(() => allOrders.filter((o) => o.status === "paid"), [allOrders]);
  const tz = event ? eventZone(event) : "Europe/London";

  const kpis = useMemo(() => {
    const ticketsSold = orders.reduce((s, o) => s + Number(o.quantity || 0), 0);
    const revenue = orders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
    const netPayout = orders.reduce((s, o) => s + Number(o.host_net || 0), 0);
    const totalDiscount = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
    const tierCapacity = tiers.reduce((s, t) => s + Number(t.quantity || 0), 0);
    const capacity = Number(event?.capacity || 0) || tierCapacity;
    return { ticketsSold, revenue, netPayout, totalDiscount, capacity };
  }, [orders, tiers, event]);

  // Cumulative tickets + revenue by day, for the interactive area chart.
  const salesSeries = useMemo(() => {
    const byDay = {};
    orders.forEach((o) => {
      const d = (o.created_date || "").slice(0, 10);
      if (!d) return;
      byDay[d] = byDay[d] || { tickets: 0, revenue: 0 };
      byDay[d].tickets += Number(o.quantity || 0);
      byDay[d].revenue += Number(o.paid_amount || 0);
    });
    const days = Object.keys(byDay).sort();
    let ct = 0, cr = 0;
    return days.map((d) => {
      ct += byDay[d].tickets;
      cr += byDay[d].revenue;
      return { day: d, label: shortDay(d), tickets: ct, revenue: cr };
    });
  }, [orders]);

  const perTier = useMemo(() => tiers.map((t) => {
    const tierOrders = orders.filter((o) => o.tier_id === t.id);
    const sold = tierOrders.reduce((s, o) => s + Number(o.quantity || 0), 0);
    return {
      id: t.id, name: t.name, price: Number(t.price || 0), quantity: Number(t.quantity || 0),
      sold, remaining: tierRemaining(t),
      revenue: tierOrders.reduce((s, o) => s + Number(o.paid_amount || 0), 0),
    };
  }), [tiers, orders]);

  const leaderboard = useMemo(() => [...promoters]
    .map((p) => ({
      id: p.id, name: p.name, tickets: Number(p.tickets_sold || 0),
      sales: Number(p.total_sales || 0), clicks: Number(p.clicks || 0),
      conversion: Number(p.clicks || 0) > 0 ? Number(p.tickets_sold || 0) / Number(p.clicks) : null,
    }))
    .filter((p) => p.tickets > 0 || p.clicks > 0)
    .sort((a, b) => b.tickets - a.tickets || b.sales - a.sales), [promoters]);

  // Tickets bought by hour-of-day (event zone) — the "when fans buy" shape.
  const byHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: hourLabel(h), tickets: 0 }));
    orders.forEach((o) => {
      if (!o.created_date) return;
      buckets[hourInZone(o.created_date, tz)].tickets += Number(o.quantity || 0);
    });
    return buckets;
  }, [orders, tz]);
  const peakHour = useMemo(() => byHour.reduce((a, b) => (b.tickets > a.tickets ? b : a), byHour[0]), [byHour]);

  // Linear sell-out projection from the pace since the first sale.
  const projection = useMemo(() => {
    const { ticketsSold, capacity } = kpis;
    if (!capacity) return { kind: "no_capacity" };
    const pct = ticketsSold / capacity;
    if (ticketsSold >= capacity) return { kind: "sold_out", pct: 1 };
    const sorted = orders.filter((o) => o.created_date).map((o) => new Date(o.created_date).getTime()).sort((a, b) => a - b);
    if (!sorted.length) return { kind: "no_sales", pct };
    const now = Date.now();
    const eventTs = event?.date ? new Date(`${event.date}T23:59:59`).getTime() : null;
    if (eventTs && eventTs < now) return { kind: "past", pct };
    const daysElapsed = Math.max(0.5, (now - sorted[0]) / DAY_MS);
    const pace = ticketsSold / daysElapsed; // tickets/day
    if (pace <= 0) return { kind: "no_sales", pct };
    const remaining = capacity - ticketsSold;
    const daysToSellout = remaining / pace;
    const projectedTs = now + daysToSellout * DAY_MS;
    if (eventTs && projectedTs > eventTs) {
      const daysUntilEvent = Math.max(0, (eventTs - now) / DAY_MS);
      const projectedByEvent = Math.min(capacity, ticketsSold + pace * daysUntilEvent);
      return { kind: "short", pct, pace, projectedPct: projectedByEvent / capacity };
    }
    return { kind: "on_track", pct, pace, projectedDate: shortDay(new Date(projectedTs).toISOString()) };
  }, [kpis, orders, event]);

  // Door: turnout + arrivals over time on the night.
  const door = useMemo(() => {
    const going = guests.filter((g) => GOING.has(g.status)).length;
    const checkedInRows = guests.filter((g) => g.checked_in_at || g.status === "checked_in");
    const checkedIn = checkedInRows.length;
    const stamps = checkedInRows.map((g) => g.checked_in_at && new Date(g.checked_in_at).getTime())
      .filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    let timeline = [];
    if (stamps.length) {
      const BUCKET = 15 * 60000;
      const start = Math.floor(stamps[0] / BUCKET) * BUCKET;
      const end = Math.ceil((stamps[stamps.length - 1] + 1) / BUCKET) * BUCKET;
      const map = {};
      stamps.forEach((t) => { const b = Math.floor(t / BUCKET) * BUCKET; map[b] = (map[b] || 0) + 1; });
      for (let b = start; b < end; b += BUCKET) timeline.push({ t: b, label: clockInZone(b, tz), count: map[b] || 0 });
    }
    return { going, checkedIn, turnout: going > 0 ? checkedIn / going : 0, timeline };
  }, [guests, tz]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!event) return (
    <div className="max-w-lg mx-auto px-4 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Couldn't load analytics.</p>
      <Button className="mt-4" onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
    </div>
  );

  const { ticketsSold, revenue, netPayout, totalDiscount, capacity } = kpis;
  const metricColor = salesMetric === "revenue" ? CHART.purple : CHART.cyan;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-xl leading-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground truncate">{event.title}</p>
        </div>
        <HomeButton />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link to={`/event/${id}/promoters`} className="block">
          <Button variant="outline" className="w-full h-11 rounded-xl gap-2 font-semibold">
            <Megaphone className="w-4 h-4" /> Promoters
          </Button>
        </Link>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline" }), "w-full h-11 rounded-xl gap-2 font-semibold")}
          onClick={exportCsv}
          disabled={exporting}
        >
          <Download className="w-4 h-4" /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* KPI hero */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatTile icon={<Ticket className="w-4 h-4" />} label="Tickets sold" value={ticketsSold.toLocaleString()}
          sub={capacity ? `of ${capacity.toLocaleString()} capacity` : "no capacity set"} />
        <StatTile icon={<TrendingUp className="w-4 h-4" />} label="Revenue" value={fmtMoney(revenue)}
          sub={totalDiscount > 0 ? `${fmtMoney(totalDiscount)} discounted` : "gross sales"} />
        <StatTile icon={<Wallet className="w-4 h-4" />} label="Net payout" value={fmtMoney(netPayout)}
          accent="text-emerald-400" sub="after fees & commission" />
        <div className="bg-secondary/40 rounded-2xl p-3.5 border border-border/50 flex items-center gap-3">
          <Ring value={capacity ? ticketsSold / capacity : 0} size={64} stroke={7} color={CHART.cyan}>
            <span className="text-sm font-bold font-heading">{capacity ? Math.round((ticketsSold / capacity) * 100) : "—"}{capacity ? "%" : ""}</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capacity sold</p>
            <p className="text-xs text-muted-foreground mt-1">{capacity ? `${Math.max(0, capacity - ticketsSold).toLocaleString()} left` : "set a capacity to track"}</p>
          </div>
        </div>
      </div>

      {/* Sales over time */}
      <Card title="Sales over time" className="mb-4"
        right={
          <div className="flex rounded-lg bg-muted/60 p-0.5 text-xs font-semibold">
            {["tickets", "revenue"].map((m) => (
              <button key={m} type="button" onClick={() => setSalesMetric(m)}
                className={cn("px-2.5 py-1 rounded-md capitalize transition-colors",
                  salesMetric === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                {m}
              </button>
            ))}
          </div>
        }>
        {salesSeries.length === 0 ? (
          <EmptyNote>No sales yet — your cumulative {salesMetric} will chart here.</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={salesSeries} margin={{ top: 8, right: 6, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={metricColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => (salesMetric === "revenue" ? fmtMoneyShort(v) : v)} />
              <Tooltip cursor={{ stroke: CHART.grid }} content={
                <TooltipCard fmt={(pl) => {
                  const p = pl[0];
                  return [p.payload.label, salesMetric === "revenue" ? `${fmtMoney(p.value)} total` : `${p.value} tickets sold`];
                }} />
              } />
              <Area type="monotone" dataKey={salesMetric} stroke={metricColor} strokeWidth={2}
                fill="url(#salesFill)" dot={false} activeDot={{ r: 4, fill: metricColor }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Tier breakdown */}
      <Card title="Tickets by tier" icon={<Ticket className="w-4 h-4" />} className="mb-4">
        {perTier.length === 0 ? (
          <EmptyNote>No ticket tiers configured.</EmptyNote>
        ) : (
          <div className="space-y-3.5">
            {perTier.map((t) => {
              const cap = t.quantity || t.sold;
              return (
                <div key={t.id}>
                  <div className="flex justify-between items-baseline mb-1.5 gap-2">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground shrink-0">
                      <span className="text-foreground font-semibold">{t.sold}</span>{t.quantity ? `/${t.quantity}` : ""} sold · {fmtMoney(t.revenue)}
                    </p>
                  </div>
                  <MeterBar value={t.sold} total={cap} color={CHART.purple} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* When fans buy */}
      <Card title="When fans buy" icon={<Clock className="w-4 h-4" />} className="mb-4"
        right={peakHour?.tickets > 0 ? <span className="text-xs text-muted-foreground">peak ~{peakHour.label}</span> : null}>
        {ticketsSold === 0 ? (
          <EmptyNote>No sales yet — purchases chart by time of day here.</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={byHour} margin={{ top: 8, right: 6, left: -4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false}
                interval={2} tickFormatter={(h) => hourLabel(h)} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: "hsl(240 10% 20% / 0.4)" }} content={
                <TooltipCard fmt={(pl) => {
                  const h = pl[0].payload.hour;
                  return [`${hourLabel(h)}–${hourLabel((h + 1) % 24)}`, `${pl[0].value} ticket${pl[0].value === 1 ? "" : "s"}`];
                }} />
              } />
              <Bar dataKey="tickets" radius={[3, 3, 0, 0]}>
                {byHour.map((b) => (
                  <Cell key={b.hour} fill={b.hour === peakHour.hour && b.tickets > 0 ? CHART.cyan : "hsl(180 100% 50% / 0.4)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Sell-out projection */}
      <Card title="Sell-out projection" icon={<Target className="w-4 h-4" />} className="mb-4">
        {projection.kind === "no_capacity" ? (
          <EmptyNote>Set an event capacity to see a sell-out projection.</EmptyNote>
        ) : (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span><span className="text-foreground font-semibold">{Math.round((projection.pct || 0) * 100)}%</span> of capacity sold</span>
              <span>{ticketsSold.toLocaleString()} / {capacity.toLocaleString()}</span>
            </div>
            <MeterBar value={ticketsSold} total={capacity} color={projection.kind === "sold_out" ? CHART.emerald : CHART.purple} />
            <p className="text-sm mt-3">
              {projection.kind === "sold_out" && <span className="text-emerald-400 font-semibold">🎉 Sold out — every ticket is gone.</span>}
              {projection.kind === "no_sales" && <span className="text-muted-foreground">No sales yet — the projection starts once tickets sell.</span>}
              {projection.kind === "past" && <span className="text-muted-foreground">The event has passed — final sales shown above.</span>}
              {projection.kind === "on_track" && <><span className="text-emerald-400 font-semibold">On track</span> <span className="text-muted-foreground">to sell out around <span className="text-foreground font-medium">{projection.projectedDate}</span>, before the event, at ~{projection.pace.toFixed(1)} tickets/day.</span></>}
              {projection.kind === "short" && <span className="text-muted-foreground">At ~{projection.pace.toFixed(1)} tickets/day you'll be about <span className="text-foreground font-medium">{Math.round(projection.projectedPct * 100)}% sold</span> by the event — consider a promo push.</span>}
            </p>
          </div>
        )}
      </Card>

      {/* Door check-in */}
      <Card title="Door check-in" icon={<DoorOpen className="w-4 h-4" />} className="mb-4">
        {door.going === 0 ? (
          <EmptyNote>No guests going yet.</EmptyNote>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-1">
              <Ring value={door.turnout} size={72} color={CHART.emerald}>
                <span className="text-sm font-bold font-heading">{Math.round(door.turnout * 100)}%</span>
              </Ring>
              <div>
                <p className="text-sm"><span className="font-bold font-heading text-lg">{door.checkedIn}</span> <span className="text-muted-foreground">checked in</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">of {door.going} going{door.checkedIn < door.going ? ` · ${door.going - door.checkedIn} still out` : ""}</p>
              </div>
            </div>
            {door.timeline.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Arrivals on the night</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={door.timeline} margin={{ top: 4, right: 6, left: -4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART.axis }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "hsl(240 10% 20% / 0.4)" }} content={
                      <TooltipCard fmt={(pl) => [pl[0].payload.label, `${pl[0].value} checked in`]} />
                    } />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} fill={CHART.emerald} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Promoter leaderboard */}
      {leaderboard.length > 0 && (
        <Card title="Promoter leaderboard" icon={<Trophy className="w-4 h-4" />} className="mb-4">
          <div className="space-y-2.5">
            {leaderboard.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className={cn("w-6 text-center font-heading font-bold text-sm shrink-0",
                  i === 0 ? "text-amber-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-700" : "text-muted-foreground")}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground shrink-0">
                      <span className="text-foreground font-semibold">{p.tickets}</span> sold · {fmtMoney(p.sales)}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.clicks} click{p.clicks === 1 ? "" : "s"}
                    {p.conversion != null && <> · <span className="text-foreground">{Math.round(p.conversion * 100)}%</span> convert</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Promo usage */}
      <Card title="Promo code usage" icon={<Tag className="w-4 h-4" />} className="mb-4">
        {promos.length === 0 ? (
          <EmptyNote>No promo codes created.</EmptyNote>
        ) : (
          <div className="space-y-2.5">
            {promos.map((p) => (
              <div key={p.id} className="flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium font-mono truncate">{p.code}</p>
                  <p className="text-xs text-muted-foreground">{p.discount_percent}% off · {p.used_count || 0}/{p.max_uses} used</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{fmtMoney(p.total_discount_given || 0)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">discount given</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
