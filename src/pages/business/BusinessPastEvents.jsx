import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/data";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Ticket, TrendingUp, Percent, Megaphone, History, Calendar } from "lucide-react";
import moment from "moment";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function BusinessPastEvents() {
  const { data: business } = useActiveAccount();

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["businessPastEvents", business?.id],
    queryFn: async () => {
      const events = await api.entities.Event.filter({ business_id: business.id }, "-date");
      const past = events.filter(
        (e) => e.status === "completed" || moment(e.date).isBefore(moment(), "day")
      );
      const out = [];
      for (const ev of past) {
        const [orders, promoters] = await Promise.all([
          api.entities.TicketOrder.filter({ event_id: ev.id, status: "paid" }),
          api.entities.Promoter.filter({ event_id: ev.id }),
        ]);
        out.push({
          event: ev,
          ticketsSold: orders.length,
          revenue: orders.reduce((s, o) => s + Number(o.paid_amount || 0), 0),
          fees: orders.reduce((s, o) => s + Number(o.platform_fee || 0), 0),
          commissionPaid: promoters.reduce((s, p) => s + Number(p.commission_paid || 0), 0),
        });
      }
      return out;
    },
    enabled: !!business?.id,
    staleTime: 60 * 1000,
  });

  if (!business || isLoading) return <LoadingSpinner fullScreen />;
  if (isError) {
    return (
      <div className="flex flex-col items-center pt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading font-semibold">Couldn't load past events</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">Something went wrong fetching your history. Please try again.</p>
      </div>
    );
  }

  const list = rows || [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center pt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading font-semibold">No past events yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">Your completed events and their analytics will appear here once they're over.</p>
      </div>
    );
  }

  const totals = {};
  for (const r of list) {
    const cur = String(r.event.currency || "gbp").toLowerCase();
    if (!totals[cur]) totals[cur] = { tickets: 0, revenue: 0, fees: 0, commission: 0 };
    totals[cur].tickets += r.ticketsSold;
    totals[cur].revenue += r.revenue;
    totals[cur].fees += r.fees;
    totals[cur].commission += r.commissionPaid;
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-xl mb-4">Past Events</h1>

      {Object.entries(totals).map(([cur, t]) => {
        const sym = SYMBOL[cur] || "";
        return (
          <div key={cur} className="bg-card rounded-2xl border border-border p-4 mb-5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-3">All Past Events · {cur.toUpperCase()}</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Ticket className="w-4 h-4" />} label="Tickets Sold" value={String(t.tickets)} />
              <Stat icon={<TrendingUp className="w-4 h-4" />} label="Total Revenue" value={`${sym}${t.revenue.toFixed(2)}`} />
              <Stat icon={<Percent className="w-4 h-4" />} label="Platform Fees" value={`${sym}${t.fees.toFixed(2)}`} />
              <Stat icon={<Megaphone className="w-4 h-4" />} label="Commission Paid" value={`${sym}${t.commission.toFixed(2)}`} />
            </div>
          </div>
        );
      })}

      <div className="space-y-3">
        {list.map((r) => {
          const cur = String(r.event.currency || "gbp").toLowerCase();
          const sym = SYMBOL[cur] || "";
          return (
            <div key={r.event.id} className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="font-heading font-semibold text-sm flex-1 truncate">{r.event.title}</p>
                <span className="text-[10px] text-muted-foreground font-mono">{moment(r.event.date).format("MMM D, YYYY")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Cell label="Tickets" value={String(r.ticketsSold)} />
                <Cell label="Revenue" value={`${sym}${r.revenue.toFixed(2)}`} />
                <Cell label="Platform fees" value={`${sym}${r.fees.toFixed(2)}`} />
                <Cell label="Commission paid" value={`${sym}${r.commissionPaid.toFixed(2)}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}<span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold font-heading">{value}</p>
    </div>
  );
}

function Cell({ label, value }) {
  return (
    <div className="bg-secondary/40 rounded-lg px-3 py-2 border border-border/50">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}