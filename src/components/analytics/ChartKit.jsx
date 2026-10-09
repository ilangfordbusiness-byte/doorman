// Shared presentational pieces for the host analytics dashboard. The app runs a
// single dark surface (see src/index.css), so charts are designed for it: single
// brand hues (purple primary, cyan accent), a recessive grid, muted axis ink, and
// a hover tooltip on every plot. Built on recharts, which is already a dependency.

// Brand-aligned chart tokens. Kept as literal hsl() so recharts can hand them to
// SVG directly; they mirror --primary / --accent / --muted-foreground in index.css.
export const CHART = {
  purple: "hsl(270 90% 65%)",
  cyan: "hsl(180 100% 50%)",
  emerald: "hsl(152 60% 50%)",
  grid: "hsl(240 10% 16%)",
  axis: "hsl(240 8% 55%)",
};

// A titled card every module sits in — one consistent surface and spacing.
export function Card({ title, icon, right, children, className = "" }) {
  return (
    <section className={`bg-secondary/40 rounded-2xl p-4 border border-border/50 ${className}`}>
      {(title || right) && (
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          {title && <h3 className="font-heading font-semibold text-sm flex-1">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// A single headline number (KPI). Optional accent recolours the value.
export function StatTile({ icon, label, value, sub, accent = "text-foreground" }) {
  return (
    <div className="bg-secondary/40 rounded-2xl p-3.5 border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-heading leading-none ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

// An SVG progress ring with a centred label — used for capacity and turnout.
export function Ring({ value = 0, size = 76, stroke = 8, color = CHART.purple, children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// A flat sold-vs-total bar (the data-end is rounded and anchored to the start).
export function MeterBar({ value = 0, total = 0, color = CHART.purple }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: "width .5s ease" }} />
    </div>
  );
}

// Custom recharts tooltip. Each chart passes a `fmt(payloadItem, label)` that
// returns the lines to show; recharts injects active/payload/label.
export function TooltipCard({ active, payload, label, fmt }) {
  if (!active || !payload || !payload.length) return null;
  const lines = fmt ? fmt(payload, label) : payload.map((p) => String(p.value));
  const rows = Array.isArray(lines) ? lines : [lines];
  return (
    <div className="rounded-lg border border-border/70 bg-background/95 backdrop-blur px-3 py-2 shadow-xl pointer-events-none">
      {rows.map((r, i) => (
        <p key={i} className={i === 0 ? "text-[11px] text-muted-foreground" : "text-sm font-semibold text-foreground"}>{r}</p>
      ))}
    </div>
  );
}

// A tidy, centred empty state for a module with no data yet.
export function EmptyNote({ children }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{children}</p>;
}
