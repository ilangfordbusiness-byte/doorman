import { useRef, useState, useLayoutEffect } from "react";

// Renders text on a single line, auto-sized so it fills the width of its
// parent (scaling up or down for any length), clamped between min/max px.
// Used for the DJ lineup names so each one spans its row. Re-fits on resize.
export default function FitText({ text, min = 18, max = 64, className = "", style = {} }) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(max);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const BASE = 40; // measure at a known size, then scale to the available width
    const fit = () => {
      el.style.fontSize = `${BASE}px`;
      const measured = el.scrollWidth;
      const avail = parent.clientWidth;
      if (measured > 0 && avail > 0) {
        const next = Math.max(min, Math.min(max, (avail / measured) * BASE));
        el.style.fontSize = `${next}px`;
        setFontSize(next);
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [text, min, max]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ ...style, fontSize, whiteSpace: "nowrap", display: "inline-block", lineHeight: 1.05 }}
    >
      {text}
    </span>
  );
}
