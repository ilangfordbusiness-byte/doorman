import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The app's standard section tab bar: a frosted-glass pill with a single active
// indicator that glides between tabs. Used everywhere tabs switch a view, so they
// all look and behave the same. Honors prefers-reduced-motion.
//
// Tabs size to their content (so a long label + badge never truncates while a
// short tab wastes space); the indicator is measured from the active tab's
// position/width, so it matches any number of tabs with any labels.
//
// tabs: [{ id, label, icon?, badge? }]  (icon is a rendered element; badge is a
// number shown as a small pill when > 0). value = active id; onChange(id) on tap.
export default function SlidingTabs({ tabs, value, onChange, className = "" }) {
  const ref = useRef(null);
  const [ind, setInd] = useState(null);

  function measure() {
    const list = ref.current;
    if (!list) return;
    let el = null;
    try { el = list.querySelector(`[data-tab="${CSS.escape(String(value))}"]`); } catch { el = null; }
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }

  useLayoutEffect(measure, [value, tabs.length]);
  useEffect(() => {
    measure();
    const list = ref.current;
    if (!list || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, tabs.length]);

  const size = tabs.length >= 5 ? "text-xs" : tabs.length === 4 ? "text-[13px]" : "text-sm";

  return (
    <div ref={ref} className={`relative flex rounded-xl p-1 bg-white/5 backdrop-blur-md border-2 border-white/15 shadow-lg shadow-black/20 ${className}`}>
      {ind && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-white/10 border border-white/25 shadow-[0_0_12px_-2px_hsl(270_90%_65%/0.45)] transition-all duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none"
          style={{ left: ind.left, width: ind.width }}
        />
      )}
      {tabs.map((t) => (
        <button
          key={t.id}
          data-tab={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`relative z-10 flex-auto flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg ${size} font-semibold whitespace-nowrap transition-colors ${value === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t.icon}
          {t.label}
          {t.badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full leading-none">{t.badge > 99 ? "99+" : t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
