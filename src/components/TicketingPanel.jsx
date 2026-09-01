import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/data";
import { Ticket, Tag, Plus, Trash2, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { bookingFee } from "@/lib/fees";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

// stripeActive: null while loading, then whether the payout account is ready —
// tier creation is server-gated on the same rule, this is the friendly path.
// feeMode: the event's fee_mode; under 'pass_on' each tier notes the booking
// fee that gets added to the buyer's price at checkout (browsing shows face).
export default function TicketingPanel({ eventId, paid, currency, stripeActive = null, feeMode = "absorb" }) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTier, setNewTier] = useState({ name: "", price: "", quantity: "" });
  const [newPromo, setNewPromo] = useState({ code: "", discount_percent: "", max_uses: "" });

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        api.entities.TicketTier.filter({ event_id: eventId }),
        api.entities.PromoCode.filter({ event_id: eventId }),
      ]);
      t.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setTiers(t);
      setPromos(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function addTier() {
    if (!newTier.name || !newTier.price || !newTier.quantity) {
      toast({ title: "Fill in all tier fields" });
      return;
    }
    try {
      const res = await api.functions.invoke("manageTicketCatalog", {
        action: "create_tier",
        event_id: eventId,
        name: newTier.name,
        price: Number(newTier.price),
        quantity: Number(newTier.quantity),
        sort_order: tiers.length,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setNewTier({ name: "", price: "", quantity: "" });
      await load();
      toast({ title: "Tier added" });
    } catch (e) {
      console.error("TicketTier create failed:", e);
      toast({ title: "Couldn't save tier", description: e?.message || "Only the event host can add tiers.", variant: "destructive" });
    }
  }

  async function removeTier(tid) {
    try {
      const res = await api.functions.invoke("manageTicketCatalog", {
        action: "delete_tier",
        event_id: eventId,
        id: tid,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (e) {
      console.error("TicketTier delete failed:", e);
      toast({ title: "Couldn't delete tier", description: e?.message || "Only the event host can delete tiers.", variant: "destructive" });
    }
  }

  async function setTierStatus(t, status) {
    try {
      const res = await api.functions.invoke("manageTicketCatalog", {
        action: "update_tier",
        event_id: eventId,
        id: t.id,
        sales_status: status,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
      toast({ title: status === "open" ? "Tier reopened" : "Tier marked sold out" });
    } catch (e) {
      console.error("TicketTier status update failed:", e);
      toast({ title: "Couldn't update tier", description: e?.message || "Only the event host can edit tiers.", variant: "destructive" });
    }
  }

  async function addPromo() {
    if (!newPromo.code || !newPromo.discount_percent || !newPromo.max_uses) {
      toast({ title: "Fill in all promo fields" });
      return;
    }
    try {
      const res = await api.functions.invoke("manageTicketCatalog", {
        action: "create_promo",
        event_id: eventId,
        code: newPromo.code.trim(),
        discount_percent: Number(newPromo.discount_percent),
        max_uses: Number(newPromo.max_uses),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setNewPromo({ code: "", discount_percent: "", max_uses: "" });
      await load();
      toast({ title: "Promo code added" });
    } catch (e) {
      console.error("PromoCode create failed:", e);
      toast({ title: "Couldn't save promo code", description: e?.message || "Only the event host can add promo codes.", variant: "destructive" });
    }
  }

  async function removePromo(pid) {
    try {
      const res = await api.functions.invoke("manageTicketCatalog", {
        action: "delete_promo",
        event_id: eventId,
        id: pid,
      });
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (e) {
      console.error("PromoCode delete failed:", e);
      toast({ title: "Couldn't delete promo code", description: e?.message || "Only the event host can delete promo codes.", variant: "destructive" });
    }
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
        {tiers.map((t) => {
          const manuallyClosed = t.sales_status === "closed";
          const naturallyOut = Number(t.sold || 0) >= Number(t.quantity || 0);
          return (
          <div key={t.id} className="bg-secondary/40 rounded-xl p-3 border border-border/50 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                {sym}{Number(t.price).toFixed(2)}
                {feeMode === "pass_on" && Number(t.price) > 0 && ` (+ ${sym}${bookingFee(t.price).toFixed(2)} booking fee at checkout)`}
                {" · "}{Math.max(0, Number(t.quantity || 0) - Number(t.sold || 0))} left
                {t.sales_status !== "open" && <span className="text-destructive"> · Sold out</span>}
              </p>
            </div>
            {manuallyClosed ? (
              <Button variant="outline" size="sm" className="rounded-lg text-xs h-8" onClick={() => setTierStatus(t, "open")}>
                Reopen
              </Button>
            ) : !naturallyOut ? (
              <Button variant="outline" size="sm" className="rounded-lg text-xs h-8" onClick={() => setTierStatus(t, "closed")}>
                End sales
              </Button>
            ) : null}
            <button onClick={() => removeTier(t.id)} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          );
        })}
        {tiers.length === 0 && <p className="text-xs text-muted-foreground">No tiers yet — add one below. Leave blank to keep the event free.</p>}
      </div>
      {stripeActive === false ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400 text-xs leading-relaxed">
          Ticket money is paid straight to your Stripe account, so payment setup must be finished
          before you can sell tickets.{" "}
          <Link to="/profile" className="underline font-semibold">Finish Stripe setup</Link>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Tier name" value={newTier.name} onChange={(e) => setNewTier((s) => ({ ...s, name: e.target.value }))} className="h-10" />
            <Input type="number" placeholder="Price" value={newTier.price} onChange={(e) => setNewTier((s) => ({ ...s, price: e.target.value }))} className="h-10" />
            <Input type="number" placeholder="Qty" value={newTier.quantity} onChange={(e) => setNewTier((s) => ({ ...s, quantity: e.target.value }))} className="h-10" />
          </div>
          <Button className="w-full h-10 rounded-xl" onClick={addTier} disabled={!newTier.name || newTier.price === "" || newTier.quantity === ""}>
            <Plus className="w-4 h-4" /> Add Tier
          </Button>
          <p className="text-[11px] text-muted-foreground">Click <span className="font-medium text-foreground">Add Tier</span> to save each tier — tiers save instantly, not on “Save Changes”.</p>
        </>
      )}

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