import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/api/data";
import { Check, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

// Square (1:1) pan/zoom editor for event cover photos, mirroring the profile
// picture cropper. Crops the visible square region to 1080x1080 and uploads
// via UploadFile, so the saved cover_image is always a true square.
export default function CoverPhotoEditor({ file, onSave, onClose }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);
  const V = 300; // viewport side length in CSS px

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const cover = Math.max(V / image.naturalWidth, V / image.naturalHeight);
      image._coverScale = cover;
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const totalScale = img ? img._coverScale * zoom : 1;
  const maxOffsetX = img ? Math.max(0, (img.naturalWidth * totalScale - V) / 2) : 0;
  const maxOffsetY = img ? Math.max(0, (img.naturalHeight * totalScale - V) / 2) : 0;

  const clamp = useCallback((o) => ({
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, o.x)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, o.y)),
  }), [maxOffsetX, maxOffsetY]);

  function onPointerDown(e) {
    if (!img) return;
    (e.target).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy }));
  }
  function onPointerUp() { dragRef.current = null; }

  async function handleSave() {
    if (!img) return;
    setSaving(true);
    try {
      const OUT = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      const imgLeft = (V - img.naturalWidth * totalScale) / 2 + offset.x;
      const imgTop = (V - img.naturalHeight * totalScale) / 2 + offset.y;
      const srcX = -imgLeft / totalScale;
      const srcY = -imgTop / totalScale;
      const srcSize = V / totalScale;
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      const cropped = new File([blob], "cover.jpg", { type: "image/jpeg" });
      const { file_url } = await api.integrations.Core.UploadFile({ file: cropped });
      onSave(file_url);
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center px-4">
      <div className="bg-card rounded-3xl border border-border w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-lg">Adjust Cover</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center mb-5">
          <div
            className="rounded-2xl overflow-hidden bg-secondary touch-none cursor-grab active:cursor-grabbing relative"
            style={{ width: V, height: V }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              <img
                src={img.src}
                alt="Adjust"
                draggable={false}
                className="absolute select-none pointer-events-none"
                style={{
                  width: img.naturalWidth * totalScale,
                  height: img.naturalHeight * totalScale,
                  left: (V - img.naturalWidth * totalScale) / 2 + offset.x,
                  top: (V - img.naturalHeight * totalScale) / 2 + offset.y,
                }}
              />
            )}
            <div className="absolute inset-0 rounded-2xl ring-2 ring-primary/40 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <ZoomIn className="w-4 h-4 text-muted-foreground" />
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => { setZoom(Number(e.target.value)); setOffset((o) => clamp(o)); }}
            className="flex-1 accent-primary"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1 rounded-xl" onClick={handleSave} disabled={!img || saving}>
            {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}