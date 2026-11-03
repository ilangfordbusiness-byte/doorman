import { useEffect, useRef } from "react";

const COLORS = ["#f0abfc", "#67e8f9", "#fcd34d", "#fb7185", "#a5b4fc", "#86efac"];

// Overlay that fires a single confetti burst the first time `fire` becomes true
// (e.g. when a profile finishes loading). Uses the Web Animations API so it
// leaves no React state behind, and respects prefers-reduced-motion.
export default function ConfettiBurst({ fire, originY = 72 }) {
  const ref = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    if (!fire || done.current || !ref.current) return;
    done.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    const ox = el.clientWidth / 2;
    for (let i = 0; i < 26; i++) {
      const p = document.createElement("span");
      p.style.cssText = `position:absolute;left:${ox}px;top:${originY}px;width:7px;height:7px;border-radius:2px;background:${COLORS[i % COLORS.length]};will-change:transform,opacity;`;
      el.appendChild(p);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const dist = 55 + Math.random() * 120;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const fall = 130 + Math.random() * 130;
      p.animate(
        [
          { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 200}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx * 1.1}px, ${dy + fall}px) rotate(${Math.random() * 560}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }
      ).onfinish = () => p.remove();
    }
  }, [fire, originY]);

  return <div ref={ref} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />;
}
