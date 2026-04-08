import { useState, useEffect } from "react";
import CoverPicker, { COVERS } from "../components/CoverPicker";
import { useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";

export default function EditEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
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
  });

  useEffect(() => {
    loadEvent();
  }, [id]);

  async function loadEvent() {
    const me = await base44.auth.me();
    const events = await base44.entities.Event.filter({ id });
    if (!events.length) return navigate("/");
    const evt = events[0];
    if (evt.host_email !== me.email) return navigate(`/event/${id}`);

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
      plus_one_allowed: evt.plus_one_allowed || false,
      capacity: evt.capacity ? String(evt.capacity) : "",
    });

    setLoading(false);
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  }

  async function handleSave() {
    if (!form.title || !form.date || !form.start_time) {
      setError("Please fill in the event name, date, and start time.");
      return;
    }

    setSaving(true);
    let cover_image = coverPreview && !coverFile ? coverPreview : "";

    if (coverFile) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: coverFile });
      cover_image = file_url;
    } else if (coverId) {
      cover_image = `__cover__${coverId}`;
    }

    // Re-geocode if address changed
    let geoFields = {};
    if (form.address) {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.address)}&limit=1`);
        const geoData = await geoRes.json();
        if (geoData[0]) {
          geoFields = { venue_lat: parseFloat(geoData[0].lat), venue_lng: parseFloat(geoData[0].lon) };
        }
      } catch {}
    }

    await base44.entities.Event.update(id, {
      ...form,
      cover_image,
      capacity: form.capacity ? Number(form.capacity) : null,
      ...geoFields,
    });

    toast({ title: "Event updated!" });
    navigate(`/event/${id}`);
  }

  if (loading) return <LoadingSpinner fullScreen />;

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
          onChange={(id) => { setCoverId(id); setCoverFile(null); setCoverPreview(null); }}
          title={form.title}
        />

        <label className="block cursor-pointer">
          <div className={`relative h-12 rounded-xl overflow-hidden border-2 border-dashed transition-colors flex items-center justify-center gap-2 text-muted-foreground ${
            coverPreview && !coverId ? "border-primary/50" : "border-border hover:border-primary/50"
          }`}>
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">
              {coverPreview && !coverId ? "Custom photo selected ✓" : "Or upload a custom photo"}
            </span>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { setCoverFile(file); setCoverPreview(URL.createObjectURL(file)); setCoverId(""); }
          }} />
        </label>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Event Name</Label>
          <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl font-medium" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Date</Label>
            <Input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} className="bg-secondary/50 border-border h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Start</Label>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Public Event</p>
              <p className="text-xs text-muted-foreground">Visible on discover page</p>
            </div>
            <Switch checked={form.is_public} onCheckedChange={(v) => updateForm("is_public", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Plus-Ones</p>
              <p className="text-xs text-muted-foreground">Allow guests to bring +1</p>
            </div>
            <Switch checked={form.plus_one_allowed} onCheckedChange={(v) => updateForm("plus_one_allowed", v)} />
          </div>
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