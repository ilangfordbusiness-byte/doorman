import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, Calendar, Clock, MapPin, Users, Shirt, FileText, Eye, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function CreateEvent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverFile, setCoverFile] = useState(null);
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

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
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

    setSaving(true);
    let cover_image = "";

    if (coverFile) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: coverFile });
      cover_image = file_url;
    }

    const me = await base44.auth.me();
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const event = await base44.entities.Event.create({
      ...form,
      cover_image,
      capacity: form.capacity ? Number(form.capacity) : null,
      host_email: me.email,
      host_name: me.full_name,
      status,
      invite_code,
    });

    toast({ title: status === "published" ? "Event published!" : "Draft saved" });
    navigate(`/event/${event.id}`);
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
        <label className="block cursor-pointer">
          <div className={`relative h-44 rounded-2xl overflow-hidden border-2 border-dashed transition-colors ${
            coverPreview ? "border-transparent" : "border-border hover:border-primary/50"
          }`}>
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">Add cover photo</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
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
          <Input
            placeholder="Full address"
            value={form.address}
            onChange={(e) => updateForm("address", e.target.value)}
            className="bg-secondary/50 border-border h-12 rounded-xl"
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