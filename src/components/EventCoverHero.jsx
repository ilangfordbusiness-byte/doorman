import { useRef, useEffect, useCallback } from "react";
import { COVERS } from "./CoverPicker";

// Preset gradient covers are stored as "__cover__<id>" and rendered from COVERS;
// uploaded photos are a plain URL. Mirrors the lookup EventDetails used to inline.
function getCoverStyle(cover_image) {
  if (cover_image?.startsWith("__cover__")) {
    const id = cover_image.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}

const MAX_TILT = 9; // degrees of pointer-driven tilt in each axis

// The event-page cover as a floating card that tilts toward the pointer/finger and
// parallaxes a little on scroll, so it reads as popping out of the screen over the
// content below. The whole square cover is shown — no bottom fade, nothing cropped.
// `topBar` is the back/share row (its handlers live in EventDetails).
export default function EventCoverHero({ event, topBar }) {
  const cardRef = useRef(null);
  const frame = useRef(0);
  // Live tilt inputs, summed when we paint: pointer offset (−0.5..0.5), a scroll
  // contribution (deg), and whether a pointer is currently on the card.
  const inputs = useRef({ px: 0, py: 0, scrollTilt: 0, active: false });

  const reduced = typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const paint = useCallback(() => {
    frame.current = 0;
    const el = cardRef.current;
    if (!el) return;
    const { px, py, scrollTilt, active } = inputs.current;
    const rotX = (-py * MAX_TILT) + scrollTilt;
    const rotY = px * MAX_TILT;
    const scale = active ? 1.02 : 1;
    el.style.transform =
      `perspective(1200px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${scale})`;
  }, []);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  // Subtle scroll parallax (also the only motion source on touch when idle).
  useEffect(() => {
    if (reduced) return undefined;
    function onScroll() {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const t = (center - window.innerHeight / 2) / window.innerHeight; // ~ −0.8..0.8
      inputs.current.scrollTilt = Math.max(-4, Math.min(4, -t * 6));
      schedule();
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [reduced, schedule]);

  function onMove(e) {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    inputs.current.px = ((e.clientX - r.left) / r.width) - 0.5;
    inputs.current.py = ((e.clientY - r.top) / r.height) - 0.5;
    inputs.current.active = true;
    el.style.transition = "transform .08s ease-out";
    schedule();
  }
  function onRest() {
    const el = cardRef.current;
    inputs.current.px = 0;
    inputs.current.py = 0;
    inputs.current.active = false;
    if (el) el.style.transition = "transform .5s ease";
    schedule();
  }

  const coverStyle = getCoverStyle(event.cover_image);
  const handlers = reduced ? {} : {
    onPointerMove: onMove, onPointerLeave: onRest, onPointerUp: onRest, onPointerCancel: onRest,
  };

  return (
    <div className="px-4 pt-4" style={{ perspective: 1200 }}>
      <div
        ref={cardRef}
        className="relative aspect-square rounded-3xl overflow-hidden ring-1 ring-white/10 will-change-transform shadow-[0_26px_50px_-12px_rgba(0,0,0,0.8),0_12px_40px_-10px_hsl(270_90%_55%/0.35)]"
        style={{ touchAction: "pan-y", transformStyle: "preserve-3d" }}
        {...handlers}
      >
        {coverStyle ? (
          <div className="w-full h-full" style={coverStyle}>
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 3px)" }} />
          </div>
        ) : event.cover_image && !event.cover_image.startsWith("__cover__") ? (
          <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/40 via-primary/20 to-accent/20" />
        )}

        {/* Only a small top scrim so the buttons stay legible — no bottom fade. */}
        <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
        <div className="absolute top-4 left-4 right-4 flex justify-between">{topBar}</div>
      </div>
    </div>
  );
}
