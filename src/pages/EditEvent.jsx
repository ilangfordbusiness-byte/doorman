import { useState, useEffect } from "react";
import CoverPicker from "../components/CoverPicker";
import CoverPhotoUpload from "../components/CoverPhotoUpload";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Ticket, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import TicketingPanel from "../components/TicketingPanel";

export default function EditEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverId, setCoverId] = useState("");
  const [coverPreview, setCoverPreview] = useState(null);
  const [original, setOriginal] = useState(null);
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
    visibility: "show_names",
    instagram: "",
  });

  useEffect(() => {
    loadEvent();
  }, [id]);

  async function loadEvent() {
    try {
      const me = await api.auth.me();
      const events = await api.entities.Event.filter({ id });
      if (!events.length) return navigate("/");
      const evt = events[0];
      const coHostEmails = Array.isArray(evt.co_host_emails) ? evt.co_host_emails : [];
      if (evt.host_email !== me.email && !coHostEmails.includes(me.email)) return navigate(`/event/${id}`);

      setOriginal(evt);

      // Parse cover
      if (evt.cover_image?.startsWith("__cover__")) {
        setCoverId(evt.cover_image.replace("__cover__", ""));
      } else if (evt.cover_image) {
        setCoverPreview(evt.cover_image);
      }

      setForm({
        title: evt.title || "",
        date: evt.date || "",
        start_time: evt.start_time || "",
        end_time: evt.end_time || "",
        venue_name: evt.venue_name || "",
        address: evt.address || "",
        dress_code: evt.dress_code || "",
        description: evt.description || "",
        entry_notes: evt.entry_notes || "",
        host_notes: evt.host_notes || "",
        is_public: evt.is_public || false,
        discoverable: evt.discoverable || false,
        plus_one_allowed: evt.plus_one_allowed || false,
        capacity: evt.capacity ? String(evt.capacity) : "",
        is_paid: evt.is_paid || false,
        currency: evt.currency || "gbp",
        visibility: evt.visibility || "show_names",
        instagram: evt.instagram || "",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  }

  function handleCoverPhoto(url) {
    setCoverPreview(url);
    if (url) setCoverId("");
  }

  async function handleSave() {
    if (!form.title || !form.date || !form.start_time) {
      setError("Please fill in the event name, date, and start time.");
      return;
    }

    setSaving(true);
    let cover_image = "";

    if (coverId) {
      cover_image = `__cover__${coverId}`;
    } else if (coverPreview) {
      cover_image = coverPreview;
    }

    await api.entities.Event.update(id, {
      ...form,
      instagram: form.instagram.trim().replace(/^@/, ""),
      cover_image,
      capacity: form.capacity ? Number(form.capacity) : null,
    });

    // Switched a free event from private → public: auto-approve pending requests
    if (!form.is_paid && form.is_public && original && !original.is_public) {
      try {
        const pending = await api.entities.GuestlistEntry.filter({ event_id: id, status: "requested" });
        if (pending.length) {
          await api.entities.GuestlistEntry.bulkUpdate(
            pending.map((e) => ({ id: e.id, status: "approved", qr_secret: crypto.randomUUID() }))
          );
          toast({ title: `${pending.length} pending request(s) auto-approved` });
        }
      } catch {}
    }

    toast({ title: "Event updated!" });
    navigate(`/event/${id}`);
  }

  if (loading) return <LoadingSpinner fullScreen />;
  if (!original) return (
    <div className="max-w-lg mx-auto px-4 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Couldn't load this event.</p>
      <Button className="mt-4" onClick={() => navigate(`/event/${id}`)}>Back to event</Button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/event/${id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-xl">Edit Event</h1>
      </div>

      <div className="space-y-5">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        <CoverPicker
          value={coverId}
          onChange={(id) => { setCoverId(id); setCoverPreview(null); }}
          title={form.title}
        />

        <CoverPhotoUpload value={coverPreview} onChange={handleCoverPhoto} />

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Event Name <span className="text-destructive">*</span></Label>
          <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl font-medium" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Start <span className="text-destructive">*</span></Label>
            <Input type="time" value={form.start_time} onChange={(e) => updateForm("start_time", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">End</Label>
            <Input type="time" value={form.end_time} onChange={(e) => updateForm("end_time", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Venue</Label>
          <Input placeholder="Venue name" value={form.venue_name} onChange={(e) => updateForm("venue_name", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl mb-2" />
          <Input placeholder="Full address" value={form.address} onChange={(e) => updateForm("address", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Dress Code</Label>
            <Input value={form.dress_code} onChange={(e) => updateForm("dress_code", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Capacity</Label>
            <Input type="number" value={form.capacity} onChange={(e) => updateForm("capacity", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</Label>
          <Textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} rows={3} className="bg-secondary/50 border-border rounded-xl resize-none" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Entry Notes</Label>
          <Input value={form.entry_notes} onChange={(e) => updateForm("entry_notes", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Staff Notes (hidden from guests)</Label>
          <Input value={form.host_notes} onChange={(e) => updateForm("host_notes", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
        </div>

        <div className="space-y-4 bg-secondary/30 rounded-2xl p-4 border border-border/50">
          {form.is_paid ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Public on Discover</p>
                <p className="text-xs text-muted-foreground">Visible on the discover page</p>
              </div>
              <Switch checked={form.is_public} onCheckedChange={(v) => updateForm("is_public", v)} />
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-2">How people join</p>
              <div className="space-y-2">
                <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.is_public ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                  <input type="radio" name="editevent-joinmode" checked={form.is_public} onChange={() => updateForm("is_public", true)} className="mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium">Public</p>
                    <p className="text-xs text-muted-foreground">Anyone can join instantly. Listed on Discover.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${!form.is_public ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                  <input type="radio" name="editevent-joinmode" checked={!form.is_public} onChange={() => updateForm("is_public", false)} className="mt-0.5 accent-primary" />
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
                      <input type="radio" name="editevent-discovermode" checked={form.discoverable} onChange={() => updateForm("discoverable", true)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">Show on Discover</p>
                        <p className="text-xs text-muted-foreground">Anyone can find it and request to join.</p>
                      </div>
                    </label>
                    <label className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${!form.discoverable ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="editevent-discovermode" checked={!form.discoverable} onChange={() => updateForm("discoverable", false)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">Link only</p>
                        <p className="text-xs text-muted-foreground">Only people with the shared link can request to join.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Who's Going Visibility</Label>
                <div className="space-y-2">
                  {[
                    { v: "show_names", l: "Show names", d: "Guests see attendee names" },
                    { v: "count_only", l: "Show count only", d: "Just a number, no names" },
                    { v: "none", l: "Show nothing", d: "No attendee info at all" },
                  ].map((o) => (
                    <label key={o.v} className={`flex items-start gap-2 rounded-xl p-2.5 border cursor-pointer ${form.visibility === o.v ? "border-primary bg-primary/10" : "border-border bg-secondary/40"}`}>
                      <input type="radio" name="editevent-visibility" checked={form.visibility === o.v} onChange={() => updateForm("visibility", o.v)} className="mt-0.5 accent-primary" />
                      <div>
                        <p className="text-sm font-medium">{o.l}</p>
                        <p className="text-xs text-muted-foreground">{o.d}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Plus-Ones</p>
              <p className="text-xs text-muted-foreground">Allow guests to bring +1</p>
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
            <>
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
              <TicketingPanel eventId={id} paid={form.is_paid} currency={form.currency} />
            </>
          )}
        </div>

        <Button
          className="w-full h-12 rounded-xl font-semibold bg-primary hover:bg-primary/90"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}