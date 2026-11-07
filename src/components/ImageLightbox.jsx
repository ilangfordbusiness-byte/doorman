import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Full-screen image viewer. Sits above the profile modals (z-[80] vs their
// z-[60]); dismiss by tapping the backdrop, the X, or pressing Escape.
// Rendered through a portal to <body> so its `position: fixed` always resolves
// against the viewport — a transformed ancestor (e.g. the floating avatar)
// would otherwise become its containing block and trap it in a tiny box.
export default function ImageLightbox({ src, alt = "", onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl"
      />
    </div>,
    document.body
  );
}
