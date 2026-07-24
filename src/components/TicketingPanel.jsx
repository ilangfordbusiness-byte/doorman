import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Ticket, Tag, Plus, Trash2, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function TicketingPanel({ eventId, paid, currency }) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTier, setNewTier] = useState({ name: "", price: "", quantity: "" });
  const [newPromo, setNewPromo] = useState({ code: "", discount_percent: "", max_uses: "" });

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    const [t, p] = await Promise.all([
      base44.entities.TicketTier.filter({ event_id: eventId }),
      base44.entities.PromoCode.filter({ event_id: eventId }),
    ]);
    t.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    setTiers(t);
    setPromos(p);
    setLoading(false);
  }

  async function addTier() {
    if (!newTier.name || !newTier.price || !newTier.quantity) {
      toast({ title: "Fill in all tier fields" });
      return;
    }
    try {
      await base44.entities.TicketTier.create({
        event_id: eventId,
        name: newTier.name,
        price: Number(newTier.price),
        quantity: Number(newTier.quantity),
        sold: 0,
        sales_status: "open",
        sort_order: tiers.length,
      });
      setNewTier({ name: "", price: "", quantity: "" });
      await load();
      toast({ title: "Tier added" });
    } catch (e) {
      console.error("TicketTier create failed:", e);
      toast({ title: "Couldn't save tier", description: e?.message || "Permission denied — only the event host can add tiers.", variant: "destructive" });
    }
  }

  async function removeTier(tid) {
    try {
      await base44.entities.TicketTier.delete(tid);
      await load();
    } catch (e) {
      console.error("TicketTier delete failed:", e);
      toast({ title: "Couldn't delete tier", description: e?.message || "Permission denied.", variant: "destructive" });
    }
  }

  async function addPromo() {
    if (!newPromo.code || !newPromo.discount_percent || !newPromo.max_uses) {
      toast({ title: "Fill in all promo fields" });
      return;
    }
    await base44.entities.PromoCode.create({
      event_id: eventId,
      code: newPromo.code.trim().toUpperCase(),
      discount_percent: Number(newPromo.discount_percent),
      max_uses: Number(newPromo.max_uses),
      used_count: 0,
      total_discount_given: 0,
      status: "active",
    });
    setNewPromo({ code: "", discount_percent: "", max_uses: "" });
    load();
    toast({ title: "Promo code added" });
  }

  async function removePromo(pid) {
    await base44.entities.PromoCode.delete(pid);
    load();
  }

  if (!paid) return null;
  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  const sym = SYMBOL[currency] || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2"><Ticket className="w-4 h-4" /> Ticket Tiers</h3>
        <Link to={`/event/${eventId}/analytics`}>
          <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {tiers.map((t) => (
          <div key={t.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                {sym}{Number(t.price).toFixed(2)} · {Math.max(0, Number(t.quantity || 0) - Number(t.sold || 0))} left
                {t.sales_status === "sold_out" && <span className="text-destructive"> · Sold out</span>}
              </p>
            </div>
            <button onClick={() => removeTier(t.id)} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {tiers.length === 0 && <p className="text-xs text-muted-foreground">No tiers yet — add one below. Leave blank to keep the event free.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Tier name" value={newTier.name} onChange={(e) => setNewTier((s) => ({ ...s, name: e.target.value }))} className="h-10" />
        <Input type="number" placeholder="Price" value={newTier.price} onChange={(e) => setNewTier((s) => ({ ...s, price: e.target.value }))} className="h-10" />
        <Input type="number" placeholder="Qty" value={newTier.quantity} onChange={(e) => setNewTier((s) => ({ ...s, quantity: e.target.value }))} className="h-10" />
      </div>
      <Button className="w-full h-10 rounded-xl" onClick={addTier} disabled={!newTier.name || newTier.price === "" || newTier.quantity === ""}>
        <Plus className="w-4 h-4" /> Add Tier
      </Button>
      <p className="text-[11px] text-muted-foreground">Click <span className="font-medium text-foreground">Add Tier</span> to save each tier — tiers save instantly, not on “Save Changes”.</p>

      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 pt-2"><Tag className="w-4 h-4" /> Promo Codes</h3>
      <div className="space-y-2">
        {promos.map((p) => (
          <div key={p.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium font-mono">{p.code}</p>
              <p className="text-xs text-muted-foreground">
                {p.discount_percent}% off · {p.used_count || 0}/{p.max_uses} used · {sym}{Number(p.total_discount_given || 0).toFixed(2)} given
                {p.status === "exhausted" && <span className="text-amber-400"> · Maxed</span>}
              </p>
            </div>
            <button onClick={() => removePromo(p.id)} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {promos.length === 0 && <p className="text-xs text-muted-foreground">No promo codes yet.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="CODE" value={newPromo.code} onChange={(e) => setNewPromo((s) => ({ ...s, code: e.target.value.toUpperCase() }))} className="h-10" />
        <Input type="number" placeholder="% off" value={newPromo.discount_percent} onChange={(e) => setNewPromo((s) => ({ ...s, discount_percent: e.target.value }))} className="h-10" />
        <Input type="number" placeholder="Max uses" value={newPromo.max_uses} onChange={(e) => setNewPromo((s) => ({ ...s, max_uses: e.target.value }))} className="h-10" />
      </div>
      <Button className="w-full h-10 rounded-xl" onClick={addPromo} disabled={!newPromo.code || !newPromo.discount_percent || !newPromo.max_uses}>
        <Plus className="w-4 h-4" /> Add Promo Code
      </Button>
    </div>
  );
}