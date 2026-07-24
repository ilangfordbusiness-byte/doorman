import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Megaphone, Copy, Check, ExternalLink, Ticket, MousePointerClick, Wallet } from "lucide-react";
import { getLinkDomain } from "@/lib/promoterRef";
import { useToast } from "@/components/ui/use-toast";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// Promoter-facing summary shown in the Account tab. Matches promoter records
// to the logged-in user by the email the host entered when adding them.
export default function PromoterAccountSection({ email }) {
  const { toast } = useToast();
  const [promoters, setPromoters] = useState([]);
  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    load();
    const unsubP = base44.entities.Promoter.subscribe(() => load());
    const unsubO = base44.entities.TicketOrder.subscribe(() => load());
    return () => {
      if (typeof unsubP === "function") unsubP();
      if (typeof unsubO === "function") unsubO();
    };
  }, [email]);

  async function load() {
    try {
      const proms = await base44.entities.Promoter.filter({ email });
      const ids = [...new Set(proms.map((p) => p.event_id))];
      const evts = await Promise.all(
        ids.map((id) => base44.entities.Event.filter({ id }).then((r) => r[0]).catch(() => null))
      );
      const map = {};
      evts.forEach((e) => { if (e) map[e.id] = e; });
      setPromoters(proms);
      setEvents(map);
    } catch {}
    setLoading(false);
  }

  function copyLink(p) {
    const link = `${getLinkDomain()}/event/${p.event_id}?ref=${p.tracking_code}`;
    navigator.clipboard.writeText(link);
    setCopied(p.id);
    toast({ title: "Tracking link copied!" });
    setTimeout(() => setCopied(""), 2000);
  }

  if (loading || !promoters.length) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-4">
      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <Megaphone className="w-4 h-4" /> Promoter
      </h3>
      <div className="space-y-3">
        {promoters.map((p) => {
          const event = events[p.event_id];
          const cur = String(event?.currency || "gbp").toLowerCase();
          const sym = SYMBOL[cur] || "";
          const link = `${getLinkDomain()}/event/${p.event_id}?ref=${p.tracking_code}`;
          return (
            <div key={p.id} className="bg-secondary/40 rounded-xl border border-border/50 p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{event?.title || "Event"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.commission_type === "flat"
                      ? `${sym}${Number(p.commission_value).toFixed(2)} / ticket`
                      : `${p.commission_value}% per ticket`}
                    {" · "}
                    <span className={p.status === "active" ? "text-emerald-400" : "text-muted-foreground"}>{p.status}</span>
                  </p>
                </div>
                <Link to={`/promoter/${p.tracking_code}`} className="text-muted-foreground hover:text-foreground flex-shrink-0" title="Full dashboard">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              <button
                onClick={() => copyLink(p)}
                className="w-full flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-xs text-left mb-2"
              >
                <span className="font-mono text-muted-foreground truncate flex-1">{link}</span>
                {copied === p.id
                  ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  : <Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              </button>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-secondary/30 rounded-lg p-2">
                  <p className="text-sm font-bold flex items-center justify-center gap-1"><Ticket className="w-3 h-3" />{Number(p.tickets_sold || 0)}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Sold</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-2">
                  <p className="text-sm font-bold flex items-center justify-center gap-1"><MousePointerClick className="w-3 h-3" />{Number(p.clicks || 0)}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Clicks</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-2">
                  <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1"><Wallet className="w-3 h-3" />{sym}{Number(p.commission_owed || 0).toFixed(2)}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Owed</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}