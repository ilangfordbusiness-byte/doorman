import { Globe2, PartyPopper } from "lucide-react";

// Holographic achievement badges for the "Parties Hosted / Attended" counts
// shown on profiles. Reuses the app's existing `holo-pan` + `shine` keyframes
// (tailwind.config.js) so the look matches the rich link previews.
//
// `variant` picks the emblem + colour story; everything else is data.
const VARIANTS = {
  hosted: {
    Icon: PartyPopper,
    // warm gold → fuchsia → violet sweep (the "host" medal)
    sheen:
      "linear-gradient(115deg, #fcd34d 0%, #f9a8d4 22%, #f0abfc 44%, #c084fc 66%, #fcd34d 88%, #f9a8d4 100%)",
    glow: "rgba(217, 70, 239, 0.28)",
  },
  attended: {
    Icon: Globe2,
    // cool disco-globe sweep: cyan → indigo → fuchsia
    sheen:
      "linear-gradient(115deg, #67e8f9 0%, #a5b4fc 25%, #d8b4fe 50%, #f0abfc 72%, #67e8f9 100%)",
    glow: "rgba(56, 189, 248, 0.26)",
  },
};

export default function ProfileBadge({ variant = "attended", value, label }) {
  const v = VARIANTS[variant] || VARIANTS.attended;
  const { Icon } = v;

  return (
    <div
      className="group relative rounded-2xl p-[1.5px] overflow-hidden isolate animate-holo-pan"
      style={{ background: v.sheen, backgroundSize: "220% 220%", boxShadow: `0 10px 30px -14px ${v.glow}` }}
    >
      {/* dark inner panel */}
      <div className="relative flex flex-col items-center text-center gap-1.5 rounded-[15px] bg-gradient-to-b from-card to-background px-3 py-4 overflow-hidden">
        {/* diagonal light sweep */}
        <div className="pointer-events-none absolute inset-0 -skew-x-12">
          <div className="absolute inset-y-0 -left-1/3 w-1/4 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shine" />
        </div>

        {/* holographic emblem */}
        <div
          className="relative grid place-items-center w-12 h-12 rounded-full animate-holo-pan"
          style={{ background: v.sheen, backgroundSize: "220% 220%" }}
        >
          {/* faint inner ring for the disco-ball / medal facet feel */}
          <div className="absolute inset-[3px] rounded-full border border-white/20" />
          <div className="absolute inset-[3px] rounded-full bg-background/35 backdrop-blur-[1px]" />
          <Icon className="relative w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" strokeWidth={2.25} />
        </div>

        {/* holographic number */}
        <p
          className="font-heading font-black text-2xl leading-none bg-clip-text text-transparent animate-holo-pan tabular-nums"
          style={{ backgroundImage: v.sheen, backgroundSize: "220% 220%" }}
        >
          {value ?? 0}
        </p>

        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
          {label}
        </p>
      </div>
    </div>
  );
}
