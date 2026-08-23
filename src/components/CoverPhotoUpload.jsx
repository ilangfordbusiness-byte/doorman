import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import CoverPhotoEditor from "./CoverPhotoEditor";

// Upload + square-crop control for event cover photos. The host picks a file,
// the square cropper opens, and on save the cropped 1:1 image (already uploaded)
// is passed to onChange. Pass null to clear.
export default function CoverPhotoUpload({ value, onChange }) {
  const [editorFile, setEditorFile] = useState(null);
  const inputRef = useRef(null);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setEditorFile(file);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="flex items-stretch gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-border flex-shrink-0 bg-secondary">
            <img src={value} alt="Cover" className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex-1 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" /> Change photo
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-10 rounded-xl border border-border bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center gap-2 text-muted-foreground text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span>Upload a custom photo</span>
        </button>
      )}

      {editorFile && (
        <CoverPhotoEditor
          file={editorFile}
          onSave={(url) => { onChange(url); setEditorFile(null); }}
          onClose={() => setEditorFile(null)}
        />
      )}
    </div>
  );
}