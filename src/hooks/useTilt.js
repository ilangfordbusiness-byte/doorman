import { useRef, useEffect } from "react";

// A small interactive 3D tilt: point/drag over the element and it leans toward
// the cursor/finger (perspective + rotateX/rotateY, clamped), easing back on
// release. Written imperatively via requestAnimationFrame so there are no
// per-frame re-renders. Also writes CSS vars --mx/--my (pointer position, %) and
// --rx/--ry (tilt, deg) so child overlays (e.g. a holographic sheen) can track it.
// Honors prefers-reduced-motion (no motion). Returns a ref to attach to the card.
export function useTilt({ max = 12, scale = 1.03 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    let frame = 0;
    const s = { rx: 0, ry: 0, mx: 50, my: 50, active: false };

    const paint = () => {
      frame = 0;
      el.style.transform =
        `perspective(900px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg) scale(${s.active ? scale : 1})`;
      el.style.setProperty("--mx", `${s.mx.toFixed(1)}%`);
      el.style.setProperty("--my", `${s.my.toFixed(1)}%`);
      el.style.setProperty("--rx", `${s.rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${s.ry.toFixed(2)}deg`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

    const move = (e) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      s.ry = (nx - 0.5) * 2 * max;
      s.rx = -(ny - 0.5) * 2 * max;
      s.mx = nx * 100;
      s.my = ny * 100;
      s.active = true;
      el.style.transition = "transform .08s ease-out";
      schedule();
    };
    const rest = () => {
      s.rx = 0; s.ry = 0; s.mx = 50; s.my = 50; s.active = false;
      el.style.transition = "transform .5s ease";
      schedule();
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", rest);
    el.addEventListener("pointerup", rest);
    el.addEventListener("pointercancel", rest);
    paint();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", rest);
      el.removeEventListener("pointerup", rest);
      el.removeEventListener("pointercancel", rest);
    };
  }, [max, scale]);

  return ref;
}
