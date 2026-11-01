import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { api } from "@/api/data";

// Downscale a picked image to a sane max dimension, preserving its aspect ratio
// (no cropping) so the host's whole photo is kept. Re-encodes to JPEG to keep
// the upload small.
async function downscaleToFile(file, maxSide = 1600, quality = 0.9) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return new File([blob], "cover.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Upload control for event cover photos. The host's full photo is kept (just
// downscaled) — nothing is cropped, so portrait or landscape both show in full
// on the event page. Pass null to clear.
export default function CoverPhotoUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const scaled = await downscaleToFile(file);
      const { file_url } = await api.integrations.Core.UploadFile({ file: scaled });
      onChange(file_url);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}
      />

      {value ? (
        <div className="flex items-stretch gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-border flex-shrink-0 bg-secondary">
            <img src={value} alt="Cover" className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex-1 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium transition-colors disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={uploading}
            className="w-10 rounded-xl border border-border bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{uploading ? "Uploading…" : "Upload a custom photo"}</span>
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">Your whole photo is kept — portrait or landscape both show in full.</p>
    </div>
  );
}
