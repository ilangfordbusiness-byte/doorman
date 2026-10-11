import { useEffect, useRef, useState } from "react";

// Animates a number counting up from 0 to `value` on mount / when it changes.
// Renders the formatted number with an optional prefix (e.g. "£") and suffix
// (e.g. "%"). Honors prefers-reduced-motion (shows the final value instantly).
export default function CountUp({ value = 0, decimals = 0, prefix = "", suffix = "", duration = 1200, className = "" }) {
  const target = Number(value) || 0;
  const [n, setN] = useState(target);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return undefined;
    }
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    setN(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  const formatted = Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}
