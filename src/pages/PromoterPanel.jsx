import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Plus, Copy, Check, Trash2, ExternalLink, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import { getLinkDomain, setLinkDomain as persistLinkDomain } from "@/lib/promoterRef";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function PromoterPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [promoters, setPromoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ctype, setCtype] = useState("percent");
  const [cvalue, setCvalue] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState("");
  const [linkDomain, setLinkDomain] = useState(getLinkDomain());
  const [domainInput, setDomainInput] = useState(getLinkDomain());

  useEffect(() => { load(); }, [id]);

  async function load() {
    const me = await base44.auth.me();
    const [events, proms] = await Promise.all([
      base44.entities.Event.filter({ id }),
      base44.entities.Promoter.filter({ event_id: id }),
    ]);
    if (!events.length) return navigate("/");
    if (events[0].host_email !== me.email) return navigate(`/event/${id}`);
    setEvent(events[0]);
    setPromoters(proms.sort((a, b) => Number(b.tickets_sold || 0) - Number(a.tickets_sold || 0)));
    setLoading(false);
  }

  async function addPromoter() {
    if (!name.trim() || cvalue === "") return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ title: "Promoter email required", description: "Enter the email they use for their DoorMan account.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await base44.entities.Promoter.create({
        event_id: id,
        name: name.trim(),
        email: cleanEmail,
        commission_type: ctype,
        commission_value: Number(cvalue),
        tracking_code: code,
        status: "active",
        tickets_sold: 0,
        total_sales: 0,
        commission_owed: 0,
        commission_paid: 0,
      });
      setName(""); setEmail(""); setCvalue("");
      toast({ title: "Promoter added!" });
      load();
    } catch {
      toast({ title: "Could not add promoter", variant: "destructive" });
    }
    setSaving(false);
  }

  async function toggleStatus(p) {
    await base44.entities.Promoter.update(p.id, { status: p.status === "active" ? "disabled" : "active" });
    load();
  }

  async function removePromoter(p) {
    await base44.entities.Promoter.delete(p.id);
    load();
  }

  async function markPaid(p) {
    await base44.entities.Promoter.update(p.id, {
      commission_paid: Number(p.commission_paid || 0) + Number(p.commission_owed || 0),
      commission_owed: 0,
    });
    toast({ title: "Commission marked as paid" });
    load();
  }

  function saveDomain() {
    const v = persistLinkDomain(domainInput);
    setLinkDomain(v);
    setDomainInput(v);
    toast({ title: "Link domain saved" });
  }

  function copyLink(p) {
    const link = `${linkDomain}/event/${id}?ref=${p.tracking_code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(p.id);
    toast({ title: "Tracking link copied!" });
    setTimeout(() => setCopiedCode(""), 2000);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  const cur = String(event.currency || "gbp").toLowerCase();
  const sym = SYMBOL[cur] || "";
  const totalTickets = promoters.reduce((s, p) => s + Number(p.tickets_sold || 0), 0);
  const totalOwed = promoters.reduce((s, p) => s + Number(p.commission_owed || 0), 0);
  const totalPaid = promoters.reduce((s, p) => s + Number(p.commission_paid || 0), 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Promoters</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{event.title}</p>

      {/* Summary across all promoters */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-secondary/40 rounded-xl p-3 border border-border/50 text-center">
          <p className="text-lg font-bold font-heading">{promoters.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Promoters</p>
        </div>
        <div className="bg-secondary/40 rounded-xl p-3 border border-border/50 text-center">
          <p className="text-lg font-bold font-heading">{totalTickets}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tickets Sold</p>
        </div>
        <div className="bg-secondary/40 rounded-xl p-3 border border-border/50 text-center">
          <p className="text-lg font-bold font-heading text-amber-400">{sym}{totalOwed.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Commission Owed</p>
        </div>
      </div>
      {totalPaid > 0 && (
        <p className="text-xs text-muted-foreground mb-4">Commission paid out so far: {sym}{totalPaid.toFixed(2)}</p>
      )}

      {/* Public link domain */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Public link domain</p>
        <div className="flex gap-2">
          <Input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="yourdomain.com" className="h-10" />
          <Button size="sm" className="h-10 rounded-xl flex-shrink-0" onClick={saveDomain}>Save</Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">Tracking links use this domain. Set it to your live domain so guests land on the real app — and deep-link into it if installed.</p>
      </div>

      {/* Add promoter */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-5 space-y-3">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add Promoter</h3>
        <Input placeholder="Promoter name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
        <Input placeholder="Promoter's account email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        <div className="flex gap-2">
          <select
            value={ctype}
            onChange={(e) => setCtype(e.target.value)}
            className="h-10 px-2 rounded-lg bg-secondary/50 border border-border text-sm flex-shrink-0"
          >
            <option value="percent">% of ticket</option>
            <option value="flat">Flat per ticket</option>
          </select>
          <Input
            type="number"
            placeholder={ctype === "percent" ? "e.g. 10" : `e.g. 2.00 (${sym})`}
            value={cvalue}
            onChange={(e) => setCvalue(e.target.value)}
            className="h-10 flex-1"
          />
        </div>
        <Button className="w-full h-11 rounded-xl" onClick={addPromoter} disabled={saving || !name.trim() || cvalue === "" || !email.trim()}>
          {saving ? "Adding..." : "Add Promoter & Generate Link"}
        </Button>
      </div>

      {/* Promoter list, best sellers first */}
      <div className="space-y-3">
        {promoters.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No promoters yet. Add one above to generate a tracking link.</p>
        )}
        {promoters.map((p) => (
          <div key={p.id} className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0">
                <p className="font-heading font-semibold text-sm truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.commission_type === "flat"
                    ? `${sym}${Number(p.commission_value).toFixed(2)} / ticket`
                    : `${p.commission_value}% per ticket`}
                  {" · "}
                  <span className={p.status === "active" ? "text-emerald-400" : "text-muted-foreground"}>{p.status}</span>
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => toggleStatus(p)} className="text-muted-foreground hover:text-foreground p-1" title="Enable/Disable">
                  <Megaphone className="w-4 h-4" />
                </button>
                <button onClick={() => removePromoter(p)} className="text-muted-foreground hover:text-destructive p-1" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={() => copyLink(p)}
              className="w-full flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-xs text-left mb-3"
            >
              <span className="font-mono text-muted-foreground truncate flex-1">{linkDomain}/event/{id}?ref={p.tracking_code}</span>
              {copiedCode === p.id ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            </button>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-secondary/40 rounded-lg p-2">
                <p className="text-sm font-bold">{Number(p.tickets_sold || 0)}</p>
                <p className="text-[9px] text-muted-foreground uppercase">Sold</p>
              </div>
              <div className="bg-secondary/40 rounded-lg p-2">
                <p className="text-sm font-bold">{sym}{Number(p.total_sales || 0).toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground uppercase">Sales</p>
              </div>
              <div className="bg-secondary/40 rounded-lg p-2">
                <p className="text-sm font-bold text-amber-400">{sym}{Number(p.commission_owed || 0).toFixed(2)}</p>
                <p className="text-[9px] text-muted-foreground uppercase">Owed</p>
              </div>
            </div>

            {Number(p.commission_owed || 0) > 0 && (
              <Button variant="outline" size="sm" className="w-full h-9 rounded-lg mt-3 text-xs" onClick={() => markPaid(p)}>
                Mark commission paid
              </Button>
            )}
            <Link to={`/promoter/${p.tracking_code}`} className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-2">
              <ExternalLink className="w-3 h-3" /> Promoter dashboard
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}