import { useState } from "react";
import CoverPicker, { COVERS } from "../components/CoverPicker";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, Calendar, Clock, MapPin, Users, Shirt, FileText, Eye, Lock, Plus, Ticket, Megaphone, Trash2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useStripeStatus } from "@/hooks/useStripeStatus";
import AddressAutocomplete from "../components/AddressAutocomplete";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function CreateEvent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connected: stripeConnected } = useStripeStatus();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverFile, setCoverFile] = useState(null);
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
    plus_one_allowed: false,
    capacity: "",
    is_paid: false,
    currency: "gbp",
    visibility: "show_names",
  });
  const [pickedGeo, setPickedGeo] = useState(null);
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

  function handleCoverChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(status) {
    if (!form.title || !form.date || !form.start_time) {
      setError("Please fill in the event name, date, and start time before continuing.");
      return;
    }

    if (form.is_paid && status === "published" && stripeConnected === false) {
      setError("Connect your Stripe account before publishing a paid event — go to Profile → Payouts & Earnings.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let cover_image = "";

      if (coverFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: coverFile });
        cover_image = file_url;
      } else if (coverId) {
        cover_image = `__cover__${coverId}`;
      }

      const me = await base44.auth.me();
      if (!me?.email) throw new Error("You must be signed in to create an event.");
      const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Use coordinates captured from autocomplete when available; fall back to geocoding
      let venue_lat = pickedGeo?.lat || null;
      let venue_lng = pickedGeo?.lng || null;
      if (form.address && (!venue_lat || !venue_lng)) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.address)}&limit=1`, { signal: controller.signal });
          clearTimeout(timeout);
          const geoData = await geoRes.json();
          if (geoData[0]) {
            venue_lat = parseFloat(geoData[0].lat);
            venue_lng = parseFloat(geoData[0].lon);
          }
        } catch {}
      }

      const event = await base44.entities.Event.create({
        ...form,
        cover_image,
        capacity: form.capacity ? Number(form.capacity) : null,
        host_email: me.email,
        host_name: me.full_name,
        status,
        invite_code,
        ...(venue_lat && venue_lng ? { venue_lat, venue_lng } : {}),
      });

      // Create ticket tiers entered during setup
      for (const t of tiers) {
        if (!t.name) continue;
        try {
          await base44.entities.TicketTier.create({
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
          await base44.entities.Promoter.create({
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
        <h1 className="font-heading font-bold text-xl">Create Event</h1>
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
          onChange={(id) => { setCoverId(id); setCoverFile(null); setCoverPreview(null); }}
          title={form.title}
        />
        {/* Or upload custom photo */}
        <label className="block cursor-pointer">
          <div className={`relative h-12 rounded-xl overflow-hidden border-2 border-dashed transition-colors flex items-center justify-center gap-2 text-muted-foreground ${
            coverPreview ? "border-primary/50" : "border-border hover:border-primary/50"
          }`}>
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">{coverPreview ? "Custom photo selected ✓" : "Or upload a custom photo"}</span>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { setCoverFile(file); setCoverPreview(URL.createObjectURL(file)); setCoverId(""); }
          }} />
        </label>

        {/* Title */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Event Name</Label>
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
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => updateForm("date", e.target.value)}
              className="bg-secondary/50 border-border h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Start</Label>
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
          <AddressAutocomplete
            value={form.address}
            onChange={(v) => updateForm("address", v)}
            onPick={(p) => {
              setPickedGeo({ lat: p.lat, lng: p.lng });
              if (p.venue_name && !form.venue_name) updateForm("venue_name", p.venue_name);
            }}
          />
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Public Event</p>
                <p className="text-xs text-muted-foreground">Visible on discover page</p>
              </div>
            </div>
            <Switch checked={form.is_public} onCheckedChange={(v) => updateForm("is_public", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Plus-Ones</p>
                <p className="text-xs text-muted-foreground">Allow guests to bring +1</p>
              </div>
            </div>
            <Switch checked={form.plus_one_allowed} onCheckedChange={(v) => updateForm("plus_one_allowed", v)} />
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
          {form.is_paid && (
            <div className="space-y-3">
              {stripeConnected === false && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400">
                  <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="text-xs leading-relaxed">
                    You need a connected Stripe account to sell tickets and receive payouts.{" "}
                    <Link to="/profile" className="underline font-semibold">Connect Stripe in your Profile</Link> first.
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Currency</Label>
                <select value={form.currency} onChange={(e) => updateForm("currency", e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="gbp">GBP (£)</option>
                  <option value="eur">EUR (€)</option>
                  <option value="usd">USD ($)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Who's Going Visibility</Label>
                <div className="space-y-2">
                  {[
                    { v: "show_names", l: "Show names", d: "Guests see attendee names" },
                    { v: "count_only", l: "Show count only", d: "Just a number, no names" },
                    { v: "none", l: "Show nothing", d: "No attendee info at all" },
                  ].map((o) => (
                    <label key={o.v} className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.visibility === o.v ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="visibility" checked={form.visibility === o.v} onChange={() => updateForm("visibility", o.v)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">{o.l}</p>
                        <p className="text-xs text-muted-foreground">{o.d}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {/* Ticket tier builder */}
              <div className="border-t border-border/50 pt-4">
                <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-2">
                  <Ticket className="w-4 h-4 text-primary" /> Ticket Tiers
                </h3>
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

              {/* Promoter setup */}
              <div className="border-t border-border/50 pt-4 mt-4">
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
          )}
        </div>

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