import { Globe2, PartyPopper } from "lucide-react";

// Borderless holographic achievement badges for the "Parties Hosted /
// Attended" counts on profiles — the count is baked into the emblem itself
// (Partiful-style) rather than sitting in a bordered tile. Reuses the app's
// `holo-pan` + `shine` keyframes (tailwind.config.js).
//
// `variant` picks the emblem + colour story; everything else is data.
const VARIANTS = {
  hosted: {
    Icon: PartyPopper,
    // warm gold → fuchsia → violet sweep (the "host" medal)
    sheen:
      "linear-gradient(135deg, #fde68a 0%, #f9a8d4 26%, #f0abfc 50%, #c084fc 74%, #fcd34d 100%)",
    ink: "#4a1d52", // deep plum — reads on the pastel holo
    glow: "rgba(217, 70, 239, 0.30)",
    disco: false,
  },
  attended: {
    Icon: Globe2,
    // cool disco-globe sweep: cyan → indigo → fuchsia
    sheen:
      "linear-gradient(135deg, #a5f3fc 0%, #a5b4fc 30%, #d8b4fe 55%, #f0abfc 80%, #67e8f9 100%)",
    ink: "#13294b", // deep navy
    glow: "rgba(56, 189, 248, 0.28)",
    disco: true,
  },
};

export default function ProfileBadge({ variant = "attended", value, label }) {
  const v = VARIANTS[variant] || VARIANTS.attended;
  const { Icon } = v;

  return (
    <div className="group flex flex-col items-center text-center gap-2.5 py-1 select-none">
      {/* holographic medallion with the count baked in */}
      <div
        className="relative grid place-items-center w-[88px] h-[88px] rounded-full animate-holo-pan"
        style={{ background: v.sheen, backgroundSize: "220% 220%", boxShadow: `0 14px 34px -12px ${v.glow}` }}
      >
        {/* glossy top-left highlight */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(60% 55% at 32% 26%, rgba(255,255,255,0.65), rgba(255,255,255,0) 60%)" }}
        />
        {/* disco facet lines (attended only) */}
        {v.disco && (
          <div className="pointer-events-none absolute inset-[7px] rounded-full overflow-hidden opacity-40">
            <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/50" />
            <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/50" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 rotate-45 bg-white/40" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 -rotate-45 bg-white/40" />
          </div>
        )}
        {/* light sweep */}
        <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-shine" />
        </div>
        {/* inner facet ring */}
        <div className="pointer-events-none absolute inset-[6px] rounded-full border border-white/25" />

        {/* the integrated count */}
        <span
          className="relative font-heading font-black text-[34px] leading-none tabular-nums"
          style={{ color: v.ink, textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}
        >
          {value ?? 0}
        </span>

        {/* emblem chip overlapping the base */}
        <div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 grid place-items-center w-7 h-7 rounded-full bg-background ring-2 ring-background"
        >
          <div
            className="grid place-items-center w-full h-full rounded-full animate-holo-pan"
            style={{ background: v.sheen, backgroundSize: "220% 220%" }}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: v.ink }} />
          </div>
        </div>
      </div>

      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
        {label}
      </p>
    </div>
  );
}
