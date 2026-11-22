import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/api/data";
import {
  X, Camera, Loader2, CalendarDays, MapPin, AlignLeft, ChevronRight, Plus, Trash2,
  ScanLine, Clock, CreditCard, Check,
} from "lucide-react";
import { formatReleaseAt, localInputToReleaseAt } from "@/lib/tiers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useStripeStatus } from "@/hooks/useStripeStatus";
import TierPriceWarning from "@/components/TierPriceWarning";
import { useBusinessStripeStatus } from "@/hooks/useBusinessStripeStatus";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { EVENT_CURRENCIES, currencySymbol, defaultCurrencyForUser, feeLabel } from "@/lib/money";
import { tierPriceProblem } from "@/lib/fees";
import TimeZoneSelect from "@/components/TimeZoneSelect";
import { browserZone } from "@/lib/eventTime";
import { COVERS } from "@/components/CoverPicker";
import { uploadCoverPhoto } from "@/components/CoverPhotoUpload";
import Avatar from "@/components/Avatar";

// Create an event. Laid out like the invite being made: cover, name, then
// When / Where / About rows that open in place; optional details as "+" chips;
// Entry (free or tickets) and Who can come as simple switches; rarer options
// under More settings; one Publish button pinned to the bottom.
// `business` creates it under that business; `onClose` overrides the X button
// (BusinessCreateEvent returns to its event list).
export default function CreateEvent({ business = null, onClose = undefined }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connected: personalConnected, active: personalActive } = useStripeStatus();
  const { connected: businessConnected, active: businessActive } = useBusinessStripeStatus(business?.id);
  const me = /** @type {{ phone?: string, stripe_default_currency?: string, full_name?: string, profile_picture?: string } | undefined} */ (useCurrentUser().data);
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
    timezone: browserZone(),
    venue_name: "",
    address: "",
    dress_code: "",
    description: "",
    entry_notes: "",
    host_notes: "",
    is_public: false,
    discoverable: false,
    plus_one_allowed: false,
    live_qr: false,
    hide_location_until_approved: false,
    capacity: "",
    is_paid: false,
    currency: "gbp", // re-seeded from the host's Stripe/phone country below
    fee_mode: "pass_on",
    visibility: "show_names",
    instagram: "",
  });
  const [promoters, setPromoters] = useState([]);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pType, setPType] = useState("percent");
  const [pValue, setPValue] = useState("");

  // Preselect the currency the host actually settles in (Stripe account
  // currency, else phone country). Runs once the profile/business is known and
  // only until the host touches the field.
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const seedSource = business
    ? { stripe_default_currency: business.stripe_default_currency, phone: me?.phone }
    : me;
  const seedCurrency = seedSource ? defaultCurrencyForUser(seedSource) : null;
  useEffect(() => {
    if (seedCurrency && !currencyTouched) setForm((f) => ({ ...f, currency: seedCurrency }));
  }, [seedCurrency, currencyTouched]);

  function updateForm(field, value) {
    if (field === "currency") setCurrencyTouched(true);
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
  const [newTier, setNewTier] = useState({ name: "", description: "", price: "", quantity: "", release_at: "", door_only: false });

  const newTierTooLow = !!tierPriceProblem(newTier.price, form.fee_mode, form.currency);

  function addTier() {
    if (!newTier.name || newTier.price === "" || newTier.quantity === "" || newTierTooLow) return;
    setTiers((prev) => [...prev, {
      name: newTier.name,
      description: newTier.description.trim(),
      price: Number(newTier.price),
      quantity: Number(newTier.quantity),
      // Door tier: hidden from the event page, sold only via the scanner QR.
      door_only: newTier.door_only,
      // Optional scheduled release (ISO); null = on sale the moment it exists.
      release_at: localInputToReleaseAt(newTier.release_at),
    }]);
    setNewTier({ name: "", description: "", price: "", quantity: "", release_at: "", door_only: false });
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

    // The host can change fee mode or currency after adding a tier. Tier saves
    // below ignore errors, so a rejected tier would vanish without a word.
    if (form.is_paid && tiers.some((t) => tierPriceProblem(t.price, form.fee_mode, form.currency))) {
      // A toast, because the page's error banner is off-screen from these buttons.
      toast({ title: "A ticket tier is below the minimum price", description: "Change its price or remove it before continuing.", variant: "destructive" });
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

      // Create ticket tiers entered during setup. The event already exists by
      // now, so a refused tier doesn't stop it: the host is told below instead.
      const failedTiers = [];
      for (const t of tiers) {
        if (!t.name) continue;
        try {
          await api.entities.TicketTier.create({
            event_id: event.id,
            name: t.name,
            description: t.description || null,
            price: t.price,
            quantity: t.quantity,
            sold: 0,
            sales_status: "open",
            sort_order: 0,
            door_only: t.door_only ?? false,
            release_at: t.release_at ?? null,
          });
        } catch (e) {
          failedTiers.push(`${t.name}: ${e?.message || "could not be saved"}`);
        }
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

      // Confirmation email to the host. Fire-and-forget: a failed send must
      // never block or fail event creation.
      api.functions.invoke("notifyEventCreated", { event_id: event.id }).catch(() => {});

      if (failedTiers.length > 0) {
        toast({
          title: `${status === "published" ? "Event published" : "Draft saved"}, but some ticket tiers weren't added`,
          description: failedTiers.join(" "),
          variant: "destructive",
          duration: 15000,
        });
      } else {
        toast({ title: status === "published" ? "Event published!" : "Draft saved" });
      }
      // Replace the form in history so the back arrow on the new event leads to
      // where the host started (hub/home), not back into an empty create form.
      navigate(`/event/${event.id}`, { replace: true });
    } catch (e) {
      setError(e?.message || "Something went wrong while saving your event. Please try again.");
      setSaving(false);
    }
  }

  const [open, setOpen] = useState({ when: false, where: false, about: false, more: false });
  const toggleOpen = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  // Optional fields revealed by their "+" chip (or already filled in).
  const [shown, setShown] = useState({});
  const extraShown = (k) => shown[k] || !!String(form[k] ?? "").trim();
  const [addingTier, setAddingTier] = useState(false);
  const [addingPromoter, setAddingPromoter] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function onCoverFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      handleCoverPhoto(await uploadCoverPhoto(file));
    } catch {
      toast({ title: "Couldn't upload that photo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const sym = currencySymbol(form.currency);
  const ready = !!(form.title.trim() && form.date && form.start_time);
  const preset = COVERS.find((c) => c.id === coverId);
  const hostName = business ? business.business_name : me?.full_name;
  const hostPicture = business ? business.business_picture : me?.profile_picture;
  const close = onClose || (() => navigate(-1));
  // The pinned bar sits above the bottom nav (personal) or the screen edge (business).
  const barBottom = business ? "bottom-0" : "bottom-[calc(52px+env(safe-area-inset-bottom))]";

  const EXTRAS = [
    { k: "dress_code", label: "Dress code", placeholder: "e.g. All white" },
    { k: "entry_notes", label: "Entry notes", placeholder: "e.g. Bring ID, arrive before 11pm" },
    { k: "capacity", label: "Capacity", placeholder: "Max guests", type: "number" },
    { k: "instagram", label: "Instagram", placeholder: "@yourhandle" },
    { k: "host_notes", label: "Staff notes", hint: "Hidden from guests", placeholder: "Notes for your door staff" },
  ];

  return (
    <div className="max-w-lg mx-auto pb-44">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/85 backdrop-blur-md">
        <button type="button" onClick={close} aria-label="Close"
          className="w-9 h-9 rounded-full bg-secondary/70 grid place-items-center text-foreground/80 hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-muted-foreground">New event</p>
        <button type="button" onClick={() => handleSubmit("draft")} disabled={saving}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground px-2 disabled:opacity-50">
          Save draft
        </button>
      </div>

      {/* Cover: upload a flyer/photo, or pick a style */}
      <div className="px-5 pt-1">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onCoverFile(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="relative w-full aspect-square rounded-[28px] overflow-hidden"
          style={!coverPreview && preset ? preset.style : undefined}>
          {coverPreview ? (
            <img src={coverPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : !preset ? (
            <div className="absolute inset-0 rounded-[28px] p-[2px] opacity-80"
              style={{ background: "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #67e8f9, #fde68a)" }}>
              <div className="w-full h-full rounded-[26px] bg-card grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-secondary grid place-items-center">
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                  </div>
                  <p className="mt-3 font-heading font-semibold text-[17px]">{uploading ? "Uploading…" : "Add a cover"}</p>
                  <p className="text-[13px] text-muted-foreground">Upload a flyer or photo</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="absolute inset-x-6 bottom-6 font-heading font-bold text-2xl text-white text-left drop-shadow-lg line-clamp-2">{form.title || "Your event"}</p>
          )}
          {(coverPreview || preset) && (
            <span className="absolute top-3 right-3 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white">
              {uploading ? "Uploading…" : "Change photo"}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-muted-foreground shrink-0">or a style</span>
          <div className="flex gap-2 overflow-x-auto py-1 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {COVERS.map((c) => (
              <button key={c.id} type="button" aria-label={c.name} title={c.name}
                onClick={() => { setCoverId(c.id); setCoverPreview(null); }}
                className={`w-8 h-8 rounded-full shrink-0 transition-transform ${coverId === c.id && !coverPreview ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : ""}`}
                style={c.style} />
            ))}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="px-5 mt-5">
        <input value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Name your event"
          aria-label="Event name"
          className="w-full bg-transparent outline-none font-heading font-bold !text-[30px] leading-tight placeholder:text-foreground/25" />
        {hostName && (
          <div className="mt-1 text-[13px] text-muted-foreground flex items-center gap-1.5">
            <Avatar src={hostPicture} name={hostName} size="w-5 h-5" textClass="text-[9px]" /> Hosted by {hostName}
          </div>
        )}
      </div>

      {/* When / Where / About */}
      <div className="mx-4 mt-5 rounded-2xl bg-secondary/40 border border-border/60 overflow-hidden divide-y divide-border/60">
        <EditRow icon={CalendarDays} tone="bg-rose-500/15 text-rose-300" label="When"
          value={whenLabel(form)} placeholder="Pick a date and time" open={open.when} onToggle={() => toggleOpen("when")}>
          <div className="space-y-2">
            <Input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} aria-label="Date"
              className="h-11 rounded-xl bg-background/60 border-border [color-scheme:dark]" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">Starts
                <Input type="time" value={form.start_time} onChange={(e) => updateForm("start_time", e.target.value)}
                  className="mt-1 h-11 rounded-xl bg-background/60 border-border [color-scheme:dark]" />
              </label>
              <label className="text-[11px] text-muted-foreground">Ends
                <Input type="time" value={form.end_time} onChange={(e) => updateForm("end_time", e.target.value)}
                  className="mt-1 h-11 rounded-xl bg-background/60 border-border [color-scheme:dark]" />
              </label>
            </div>
            <TimeZoneSelect value={form.timezone} onChange={(tz) => updateForm("timezone", tz)} />
          </div>
        </EditRow>

        <EditRow icon={MapPin} tone="bg-sky-500/15 text-sky-300" label="Where"
          value={[form.venue_name, form.address].filter(Boolean).join(" · ")} placeholder="Add a venue"
          open={open.where} onToggle={() => toggleOpen("where")}>
          <div className="space-y-2">
            <Input placeholder="Venue name" value={form.venue_name} onChange={(e) => updateForm("venue_name", e.target.value)}
              className="h-11 rounded-xl bg-background/60 border-border" />
            <Input placeholder="Address" value={form.address} onChange={(e) => updateForm("address", e.target.value)}
              className="h-11 rounded-xl bg-background/60 border-border" />
            {/* Free events only: buyers of paid tickets always see the venue. */}
            {!form.is_paid && (
              <ToggleRow title="Hide address until approved" hint="Guests see the venue once you approve them"
                checked={form.hide_location_until_approved} onChange={(v) => updateForm("hide_location_until_approved", v)} />
            )}
          </div>
        </EditRow>

        <EditRow icon={AlignLeft} tone="bg-violet-500/15 text-violet-300" label="About"
          value={form.description} placeholder="Tell guests what to expect" open={open.about} onToggle={() => toggleOpen("about")}>
          <Textarea placeholder="Tell guests what to expect…" value={form.description} rows={4}
            onChange={(e) => updateForm("description", e.target.value)}
            className="rounded-xl bg-background/60 border-border resize-none text-[15px]" />
        </EditRow>
      </div>

      {/* Optional details */}
      <div className="px-5 mt-4">
        <div className="flex flex-wrap gap-2">
          {EXTRAS.filter((x) => !extraShown(x.k)).map((x) => (
            <button key={x.k} type="button" onClick={() => setShown((sh) => ({ ...sh, [x.k]: true }))}
              className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-full border border-dashed border-foreground/25 text-foreground/75 hover:border-foreground/50 hover:text-foreground transition-colors">
              <Plus className="w-3.5 h-3.5" /> {x.label}
            </button>
          ))}
        </div>
        <div className="space-y-3 mt-3">
          {EXTRAS.filter((x) => extraShown(x.k)).map((x) => (
            <div key={x.k}>
              <p className="text-[11px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">
                {x.label}{x.hint && <span className="normal-case tracking-normal font-normal"> · {x.hint}</span>}
              </p>
              <Input type={x.type || "text"} placeholder={x.placeholder} value={form[x.k]} autoFocus={shown[x.k] && !form[x.k]}
                onChange={(e) => updateForm(x.k, e.target.value)} className="h-11 rounded-xl bg-secondary/40 border-border/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Entry */}
      <Section title="Entry">
        <Segmented value={form.is_paid ? "paid" : "free"} onChange={(v) => updateForm("is_paid", v === "paid")}
          options={[{ v: "free", l: "Free" }, { v: "paid", l: "Sell tickets" }]} />

        {form.is_paid && (
          <div className="mt-3 space-y-3">
            {stripeConnected !== null && !stripeActive && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400">
                <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs leading-relaxed">
                  Ticket money is paid straight to your Stripe account, so finish payment setup before selling.{" "}
                  <Link to={business ? "/business/create-event" : "/profile"} className="underline font-semibold">Finish Stripe setup</Link>
                </p>
              </div>
            )}

            <div className="rounded-2xl bg-secondary/40 border border-border/60 overflow-hidden divide-y divide-border/60">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold flex items-center gap-1.5">
                      <span className="truncate">{t.name}</span>
                      {t.door_only && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-400">
                          <ScanLine className="w-2.5 h-2.5" /> Door
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.quantity} tickets · {t.release_at ? `on sale ${formatReleaseAt(t.release_at)}` : "on sale when published"}
                    </p>
                    {t.description && <p className="text-xs text-muted-foreground whitespace-pre-line break-words mt-0.5">{t.description}</p>}
                    <TierPriceWarning price={t.price} currency={form.currency} feeMode={form.fee_mode} className="mt-2" />
                  </div>
                  <p className="font-heading font-bold text-[17px]">{sym}{Number(t.price).toFixed(Number.isInteger(Number(t.price)) ? 0 : 2)}</p>
                  <button type="button" onClick={() => removeTier(i)} aria-label={`Remove ${t.name}`}
                    className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {addingTier ? (
                <div className="p-4 space-y-2">
                  <Input placeholder="Ticket name, e.g. Early bird" value={newTier.name} autoFocus
                    onChange={(e) => setNewTier((s) => ({ ...s, name: e.target.value }))} className="h-11 rounded-xl bg-background/60" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder={`Price (${sym})`} value={newTier.price}
                      onChange={(e) => setNewTier((s) => ({ ...s, price: e.target.value }))} className="h-11 rounded-xl bg-background/60" />
                    <Input type="number" placeholder="How many" value={newTier.quantity}
                      onChange={(e) => setNewTier((s) => ({ ...s, quantity: e.target.value }))} className="h-11 rounded-xl bg-background/60" />
                  </div>
                  <TierPriceWarning price={newTier.price} currency={form.currency} feeMode={form.fee_mode} />
                  <Textarea placeholder="Description (optional), e.g. Includes a welcome drink" value={newTier.description}
                    onChange={(e) => setNewTier((s) => ({ ...s, description: e.target.value }))} maxLength={280} rows={2}
                    className="rounded-xl bg-background/60 resize-none" />
                  <label className="block text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Goes on sale (optional, your local time)</span>
                    <input type="datetime-local" value={newTier.release_at}
                      onChange={(e) => setNewTier((s) => ({ ...s, release_at: e.target.value }))}
                      className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-base md:text-sm [color-scheme:dark]" />
                  </label>
                  <ToggleRow title="Door only" hint="Hidden from the event page; sold through the scanner's door QR"
                    checked={newTier.door_only} onChange={(v) => setNewTier((s) => ({ ...s, door_only: v }))} />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="ghost" className="flex-1 h-11 rounded-xl"
                      onClick={() => { setAddingTier(false); setNewTier({ name: "", description: "", price: "", quantity: "", release_at: "", door_only: false }); }}>
                      Cancel
                    </Button>
                    <Button type="button" className="flex-1 h-11 rounded-xl"
                      disabled={!newTier.name || newTier.price === "" || newTier.quantity === "" || newTierTooLow}
                      onClick={() => { addTier(); setAddingTier(false); }}>
                      Add ticket
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingTier(true)}
                  className="w-full flex items-center gap-2 px-4 py-3.5 text-sm font-semibold text-primary hover:bg-secondary/40 transition-colors">
                  <Plus className="w-4 h-4" /> {tiers.length ? "Add another ticket type" : "Add a ticket type"}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Booking fee</p>
                <p className="text-[11px] text-muted-foreground">{feeLabel(form.currency)}</p>
              </div>
              <Segmented compact value={form.fee_mode} onChange={(v) => updateForm("fee_mode", v)}
                options={[{ v: "pass_on", l: "Guests pay" }, { v: "absorb", l: "You pay" }]} />
            </div>
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[13px] font-medium">Currency</p>
              <select value={form.currency} onChange={(e) => updateForm("currency", e.target.value)}
                className="h-9 rounded-lg border border-border bg-secondary/40 px-3 text-sm">
                {EVENT_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </Section>

      {/* Who can come */}
      <Section title="Who can come">
        {!form.is_paid && (
          <>
            <Segmented value={form.is_public ? "public" : "private"} onChange={(v) => updateForm("is_public", v === "public")}
              options={[{ v: "public", l: "Anyone" }, { v: "private", l: "I approve guests" }]} />
            <p className="text-xs text-muted-foreground px-1 mt-2">
              {form.is_public ? "Anyone can join instantly." : "Guests request to join and you approve each one."}
            </p>
          </>
        )}
        <div className="mt-3 rounded-2xl bg-secondary/40 border border-border/60 divide-y divide-border/60">
          {/* Free + Anyone is always listed; otherwise the host chooses. */}
          {form.is_paid ? (
            <ToggleRow padded title="Show on Discover" hint="Otherwise only people with the link can find it"
              checked={form.is_public} onChange={(v) => updateForm("is_public", v)} />
          ) : form.is_public ? (
            <ToggleRow padded title="Show on Discover" hint="Open events are always listed on Discover" checked disabled onChange={() => {}} />
          ) : (
            <ToggleRow padded title="Show on Discover" hint="Otherwise only people with the link can find it"
              checked={form.discoverable} onChange={(v) => updateForm("discoverable", v)} />
          )}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Who&apos;s going</p>
              <p className="text-xs text-muted-foreground">What guests see about each other</p>
            </div>
            <select value={form.visibility} onChange={(e) => updateForm("visibility", e.target.value)} aria-label="Who's going visibility"
              className="bg-transparent text-sm text-foreground/85 outline-none text-right">
              <option value="show_names">Names</option>
              <option value="count_only">Count only</option>
              <option value="none">Hidden</option>
            </select>
          </div>
          {/* Commission is paid on ticket sales, so promoters need tickets. */}
          {form.is_paid && (
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Promoters</p>
                  <p className="text-xs text-muted-foreground">Tracking links with commission</p>
                </div>
                {!addingPromoter && (
                  <button type="button" onClick={() => setAddingPromoter(true)} className="text-sm font-semibold text-primary inline-flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                )}
              </div>
              {promoters.length > 0 && (
                <div className="mt-3 space-y-2">
                  {promoters.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.commission_type === "flat" ? `${sym}${Number(p.commission_value).toFixed(2)} per ticket` : `${p.commission_value}% per ticket`}
                          {p.email ? ` · ${p.email}` : ""}
                        </p>
                      </div>
                      <button type="button" onClick={() => removePromoter(i)} aria-label={`Remove ${p.name}`}
                        className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              {addingPromoter && (
                <div className="mt-3 space-y-2">
                  <Input placeholder="Promoter name" value={pName} autoFocus onChange={(e) => setPName(e.target.value)} className="h-11 rounded-xl bg-background/60" />
                  <Input placeholder="Email (optional)" value={pEmail} onChange={(e) => setPEmail(e.target.value)} className="h-11 rounded-xl bg-background/60" />
                  <div className="flex gap-2">
                    <select value={pType} onChange={(e) => setPType(e.target.value)}
                      className="h-11 px-2 rounded-xl bg-background/60 border border-border text-sm flex-shrink-0">
                      <option value="percent">% of ticket</option>
                      <option value="flat">Flat per ticket</option>
                    </select>
                    <Input type="number" placeholder={pType === "percent" ? "e.g. 10" : `e.g. 2.00 (${sym})`} value={pValue}
                      onChange={(e) => setPValue(e.target.value)} className="h-11 flex-1 rounded-xl bg-background/60" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => setAddingPromoter(false)}>Cancel</Button>
                    <Button type="button" className="flex-1 h-11 rounded-xl" disabled={!pName.trim() || pValue === ""}
                      onClick={() => { addPromoter(); setAddingPromoter(false); }}>Add promoter</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* More settings */}
      <div className="px-4 mt-6">
        <button type="button" onClick={() => toggleOpen("more")} className="w-full flex items-center justify-between px-1 py-2">
          <span className="font-heading font-semibold text-[17px]">More settings</span>
          <span className="text-sm text-muted-foreground">{open.more ? "Hide" : "Show"}</span>
        </button>
        {open.more && (
          <div className="mt-1 rounded-2xl bg-secondary/40 border border-border/60 divide-y divide-border/60">
            <ToggleRow padded title="Allow +1s" hint="Approve a guest with a plus-one; they come as one guest on your list"
              checked={form.plus_one_allowed} onChange={(v) => updateForm("plus_one_allowed", v)} />
            <ToggleRow padded title="Live passes" hint="QR codes refresh every few seconds, so screenshots can't be shared. Guests need signal."
              checked={form.live_qr} onChange={(v) => updateForm("live_qr", v)} />
          </div>
        )}
      </div>

      {/* Publish, pinned to the bottom */}
      <div className={`fixed inset-x-0 ${barBottom} z-30 pointer-events-none`}>
        <div className="max-w-lg mx-auto px-4 pt-6 pb-4 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-auto">
          {error && <p className="text-xs text-destructive font-medium text-center mb-2">{error}</p>}
          <Button onClick={() => handleSubmit("published")} disabled={saving || !ready}
            className={`w-full h-14 rounded-2xl font-heading font-bold text-[17px] gap-2 ${ready ? "shadow-lg shadow-primary/30" : "bg-secondary text-muted-foreground disabled:opacity-100"}`}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : ready ? <Check className="w-5 h-5" /> : null}
            {saving ? "Publishing…" : !ready ? "Add a name and date to publish" : form.is_paid ? "Publish and start selling" : "Publish event"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// "Fri 12 Dec · 10pm – 3am" from the form's date/start/end (local, as typed).
function whenLabel(form) {
  if (!form.date) return "";
  const d = new Date(`${form.date}T12:00:00`);
  const day = Number.isNaN(d.getTime()) ? form.date : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const t = (hhmm) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  };
  const times = form.start_time ? ` · ${t(form.start_time)}${form.end_time ? ` – ${t(form.end_time)}` : ""}` : "";
  return `${day}${times}`;
}

// A tappable summary row that opens its editor in place.
function EditRow({ icon: Icon, tone, label, value, placeholder, open, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/30 transition-colors">
        <span className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${tone}`}><Icon className="w-[18px] h-[18px]" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</span>
          <span className={`block text-[15px] truncate ${value ? "text-foreground" : "text-foreground/40"}`}>{value || placeholder}</span>
        </span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="px-4 mt-7">
      <h2 className="font-heading font-semibold text-[17px] px-1 mb-2.5">{title}</h2>
      {children}
    </div>
  );
}

// iOS-style segmented control.
function Segmented({ value, onChange, options, compact = false }) {
  return (
    <div className={`grid grid-flow-col auto-cols-fr gap-1 p-1 bg-secondary/60 ${compact ? "rounded-xl flex-shrink-0" : "rounded-2xl"}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`${compact ? "px-3 py-1.5 text-xs" : "py-2.5 text-[13px]"} rounded-[10px] font-semibold transition-colors whitespace-nowrap ${value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ title, hint, checked, onChange, disabled = false, padded = false }) {
  return (
    <div className={`flex items-center gap-3 ${padded ? "px-4 py-3.5" : "pt-1"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
