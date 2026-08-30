import { useState } from "react";
import CoverPicker from "../components/CoverPicker";
import CoverPhotoUpload from "../components/CoverPhotoUpload";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Eye, Plus, Ticket, Megaphone, Trash2, CreditCard, AtSign, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import HomeButton from "@/components/HomeButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useStripeStatus } from "@/hooks/useStripeStatus";
import { useBusinessStripeStatus } from "@/hooks/useBusinessStripeStatus";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function CreateEvent({ business = null }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connected: personalConnected, active: personalActive } = useStripeStatus();
  const { connected: businessConnected, active: businessActive } = useBusinessStripeStatus(business?.id);
  const stripeConnected = business ? businessConnected : personalConnected;
  // Selling tickets requires payouts-enabled onboarding, not just a connected
  // account — the server enforces the same rule at tier creation and checkout.
  const stripeActive = business ? businessActive : personalActive;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverId, setCoverId] = useState("");
  const [coverPreview, setCoverPreview] = useState(null);
  const [form, setForm] = useState({
    title: "",
    date: "",
    start_time: "",
    end_time: "",
    venue_name: "",
    address: "",
    dress_code: "",
    description: "",
    entry_notes: "",
    host_notes: "",
    is_public: false,
    discoverable: false,
    plus_one_allowed: false,
    capacity: "",
    is_paid: false,
    currency: "gbp",
    fee_mode: "pass_on",
    visibility: "show_names",
    instagram: "",
  });
  const [promoters, setPromoters] = useState([]);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pType, setPType] = useState("percent");
  const [pValue, setPValue] = useState("");

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  }

  function addPromoter() {
    if (!pName.trim() || pValue === "") return;
    setPromoters((prev) => [...prev, {
      name: pName.trim(),
      email: pEmail.trim().toLowerCase(),
      commission_type: pType,
      commission_value: Number(pValue),
    }]);
    setPName(""); setPEmail(""); setPValue("");
  }

  function removePromoter(i) {
    setPromoters((prev) => prev.filter((_, idx) => idx !== i));
  }

  const [tiers, setTiers] = useState([]);
  const [newTier, setNewTier] = useState({ name: "", price: "", quantity: "" });

  function addTier() {
    if (!newTier.name || newTier.price === "" || newTier.quantity === "") return;
    setTiers((prev) => [...prev, {
      name: newTier.name,
      price: Number(newTier.price),
      quantity: Number(newTier.quantity),
    }]);
    setNewTier({ name: "", price: "", quantity: "" });
  }

  function removeTier(i) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleCoverPhoto(url) {
    setCoverPreview(url);
    if (url) setCoverId("");
  }

  async function handleSubmit(status) {
    if (!form.title || !form.date || !form.start_time) {
      setError("Please fill in the event name, date, and start time before continuing.");
      return;
    }

    if (form.is_paid && status === "published" && stripeConnected !== null && !stripeActive) {
      setError("Finish your Stripe payment setup before publishing a paid event — go to Profile → Payouts & Earnings.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let cover_image = "";

      if (coverId) {
        cover_image = `__cover__${coverId}`;
      } else if (coverPreview) {
        cover_image = coverPreview;
      }

      const me = await api.auth.me();
      if (!me?.email) throw new Error("You must be signed in to create an event.");
      const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const event = await api.entities.Event.create({
        ...form,
        instagram: form.instagram.trim().replace(/^@/, ""),
        cover_image,
        capacity: form.capacity ? Number(form.capacity) : null,
        host_email: me.email,
        host_name: business ? business.business_name : me.full_name,
        host_picture: business ? (business.business_picture || "") : (me.profile_picture || ""),
        business_id: business ? business.id : "",
        status,
        invite_code,
      });

      // Create ticket tiers entered during setup
      for (const t of tiers) {
        if (!t.name) continue;
        try {
          await api.entities.TicketTier.create({
            event_id: event.id,
            name: t.name,
            price: t.price,
            quantity: t.quantity,
            sold: 0,
            sales_status: "open",
            sort_order: 0,
          });
        } catch {}
      }

      // Create promoters entered during setup
      for (const p of promoters) {
        if (!p.name) continue;
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        try {
          await api.entities.Promoter.create({
            event_id: event.id,
            name: p.name,
            email: p.email || undefined,
            commission_type: p.commission_type,
            commission_value: p.commission_value,
            tracking_code: code,
            status: "active",
            tickets_sold: 0,
            total_sales: 0,
            commission_owed: 0,
            commission_paid: 0,
          });
        } catch {}
      }

      toast({ title: status === "published" ? "Event published!" : "Draft saved" });
      navigate(`/event/${event.id}`);
    } catch (e) {
      setError(e?.message || "Something went wrong while saving your event. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl flex-1">Create Event</h1>
        <HomeButton />
      </div>

      <div className="space-y-5">
        {/* Validation error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {/* Cover Image */}
        <CoverPicker
          value={coverId}
          onChange={(id) => { setCoverId(id); setCoverPreview(null); }}
          title={form.title}
        />
        {/* Or upload a custom photo (square crop) */}
        <CoverPhotoUpload value={coverPreview} onChange={handleCoverPhoto} />

        {/* Title */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Event Name <span className="text-destructive">*</span></Label>
          <Input
            placeholder="e.g. Summer Rooftop Party"
            value={form.title}
            onChange={(e) => updateForm("title", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl font-medium"
          />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => updateForm("date", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Start <span className="text-destructive">*</span></Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => updateForm("start_time", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">End</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => updateForm("end_time", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
        </div>

        {/* Venue */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Venue</Label>
          <Input
            placeholder="Venue name"
            value={form.venue_name}
            onChange={(e) => updateForm("venue_name", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl mb-2"
          />
          <Input
            placeholder="Full address"
            value={form.address}
            onChange={(e) => updateForm("address", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl"
          />
        </div>

        {/* Instagram */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Instagram (Company)</Label>
          <div className="relative">
            <AtSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="yourhandle"
              value={form.instagram}
              onChange={(e) => updateForm("instagram", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl pl-9"
            />
          </div>
        </div>

        {/* Dress Code & Capacity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Dress Code</Label>
            <Input
              placeholder="e.g. Smart casual"
              value={form.dress_code}
              onChange={(e) => updateForm("dress_code", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Capacity</Label>
            <Input
              type="number"
              placeholder="Max guests"
              value={form.capacity}
              onChange={(e) => updateForm("capacity", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</Label>
          <Textarea
            placeholder="Tell guests what to expect..."
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            rows={3}
            className="bg-secondary/50 border-border rounded-xl resize-none"
          />
        </div>

        {/* Entry Notes */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Entry Notes</Label>
          <Input
            placeholder="e.g. Bring ID, arrive before 11pm"
            value={form.entry_notes}
            onChange={(e) => updateForm("entry_notes", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl"
          />
        </div>

        {/* Host Notes */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Staff Notes (hidden from guests)</Label>
          <Input
            placeholder="Internal notes for doormen/staff"
            value={form.host_notes}
            onChange={(e) => updateForm("host_notes", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-4 bg-secondary/30 rounded-2xl p-4 border border-border/50">
          {form.is_paid ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Public on Discover</p>
                  <p className="text-xs text-muted-foreground">Visible on the discover page</p>
                </div>
              </div>
              <Switch checked={form.is_public} onCheckedChange={(v) => updateForm("is_public", v)} />
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-2">How people join</p>
              <div className="space-y-2">
                <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.is_public ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                  <input type="radio" name="joinmode" checked={form.is_public} onChange={() => updateForm("is_public", true)} className="mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium">Public</p>
                    <p className="text-xs text-muted-foreground">Anyone can join instantly. Listed on Discover.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${!form.is_public ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                  <input type="radio" name="joinmode" checked={!form.is_public} onChange={() => updateForm("is_public", false)} className="mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium">Private</p>
                    <p className="text-xs text-muted-foreground">Guests request to join — you approve each one.</p>
                  </div>
                </label>
              </div>
              {!form.is_public && (
                <div className="mt-3 pl-1">
                  <p className="text-xs text-muted-foreground mb-2">Who can find this event?</p>
                  <div className="space-y-2">
                    <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.discoverable ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="discovermode" checked={form.discoverable} onChange={() => updateForm("discoverable", true)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">Show on Discover</p>
                        <p className="text-xs text-muted-foreground">Anyone can find it and request to join.</p>
                      </div>
                    </label>
                    <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${!form.discoverable ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="discovermode" checked={!form.discoverable} onChange={() => updateForm("discoverable", false)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">Link only</p>
                        <p className="text-xs text-muted-foreground">Only people with the shared link can request to join.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Who's Going Visibility</Label>
            <div className="space-y-2">
              {[
                { v: "show_names", l: "Show names", d: "Guests see attendee names" },
                { v: "count_only", l: "Show count only", d: "Just a number, no names" },
                { v: "none", l: "Show nothing", d: "No attendee info at all" },
              ].map((o) => (
                <label key={o.v} className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.visibility === o.v ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                  <input type="radio" name="createevent-visibility" checked={form.visibility === o.v} onChange={() => updateForm("visibility", o.v)} className="mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium">{o.l}</p>
                    <p className="text-xs text-muted-foreground">{o.d}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Paid Ticketing */}
        <div className="space-y-4 bg-secondary/30 rounded-2xl p-4 border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Ticket className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Paid Event</p>
                <p className="text-xs text-muted-foreground">Sell tickets, or leave it free</p>
              </div>
            </div>
            <Switch checked={form.is_paid} onCheckedChange={(v) => updateForm("is_paid", v)} />
          </div>
          {form.is_paid && stripeConnected !== null && !stripeActive && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400">
              <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs leading-relaxed">
                Ticket money is paid straight to your Stripe account, so payment setup must be
                finished before you can sell tickets.{" "}
                <Link to={business ? "/business/create-event" : "/profile"} className="underline font-semibold">Finish Stripe setup</Link>.
              </div>
            </div>
          )}
        </div>

        {form.is_paid && (
          <>
            {/* Ticket Tiers */}
            <div className="space-y-4 bg-secondary/30 rounded-2xl p-4 border border-border/50">
              <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary" /> Ticket Tiers
              </h3>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Currency</Label>
                <select value={form.currency} onChange={(e) => updateForm("currency", e.target.value)} className="h-9 w-32 rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="gbp">GBP (£)</option>
                  <option value="eur">EUR (€)</option>
                  <option value="usd">USD ($)</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-3">Add your ticket tiers now — they'll be live the moment you publish.</p>
                {tiers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {tiers.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2 border border-border/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground">{SYMBOL[form.currency] || ""}{Number(t.price).toFixed(2)} · {t.quantity} tickets</p>
                        </div>
                        <button onClick={() => removeTier(i)} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr_auto] gap-2">
                  <Input placeholder="Tier name" value={newTier.name} onChange={(e) => setNewTier((s) => ({ ...s, name: e.target.value }))} className="h-10 bg-secondary/50" />
                  <Input type="number" placeholder="Price" value={newTier.price} onChange={(e) => setNewTier((s) => ({ ...s, price: e.target.value }))} className="h-10 bg-secondary/50" />
                  <Input type="number" placeholder="Qty" value={newTier.quantity} onChange={(e) => setNewTier((s) => ({ ...s, quantity: e.target.value }))} className="h-10 bg-secondary/50" />
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={addTier} disabled={!newTier.name || newTier.price === "" || newTier.quantity === ""}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {/* Booking fee — who pays the platform fee */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Booking Fee</Label>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Booking fee details" className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded">
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">45p + 4% per ticket</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-2">
                  {[
                    { v: "pass_on", l: "Added to the ticket price", d: "Buyers pay it — prices are always shown fee-inclusive. You receive full face value." },
                    { v: "absorb", l: "Absorbed in your payout", d: "Buyers pay exactly the price you set; the fee comes out of your share." },
                  ].map((o) => (
                    <label key={o.v} className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.fee_mode === o.v ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="fee_mode" checked={form.fee_mode === o.v} onChange={() => updateForm("fee_mode", o.v)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">{o.l}</p>
                        <p className="text-xs text-muted-foreground">{o.d}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Promoters */}
            <div className="space-y-4 bg-secondary/30 rounded-2xl p-4 border border-border/50">
              <div>
                <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
                  <Megaphone className="w-4 h-4 text-amber-400" /> Promoters
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Add promoters now to generate tracking links the moment your event is live. You can manage them later under Promoters.
                </p>
                {promoters.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {promoters.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-2 border border-border/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {p.commission_type === "flat"
                              ? `${SYMBOL[form.currency] || ""}${Number(p.commission_value).toFixed(2)} / ticket`
                              : `${p.commission_value}% per ticket`}
                            {p.email ? ` · ${p.email}` : ""}
                          </p>
                        </div>
                        <button onClick={() => removePromoter(i)} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <Input placeholder="Promoter name" value={pName} onChange={(e) => setPName(e.target.value)} className="h-10 bg-secondary/50" />
                  <Input placeholder="Email (optional)" value={pEmail} onChange={(e) => setPEmail(e.target.value)} className="h-10 bg-secondary/50" />
                  <div className="flex gap-2">
                    <select
                      value={pType}
                      onChange={(e) => setPType(e.target.value)}
                      className="h-10 px-2 rounded-lg bg-secondary/50 border border-border text-sm flex-shrink-0"
                    >
                      <option value="percent">% of ticket</option>
                      <option value="flat">Flat per ticket</option>
                    </select>
                    <Input
                      type="number"
                      placeholder={pType === "percent" ? "e.g. 10" : `e.g. 2.00 (${SYMBOL[form.currency] || ""})`}
                      value={pValue}
                      onChange={(e) => setPValue(e.target.value)}
                      className="h-10 flex-1 bg-secondary/50"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={addPromoter} disabled={!pName.trim() || pValue === ""}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl font-semibold"
            onClick={() => handleSubmit("draft")}
            disabled={saving}
          >
            Save Draft
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl font-semibold bg-primary hover:bg-primary/90"
            onClick={() => handleSubmit("published")}
            disabled={saving}
          >
            {saving ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}