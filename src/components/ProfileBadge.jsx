import { Sparkles, PartyPopper } from "lucide-react";

// Borderless holographic achievement badges for the "Parties Hosted /
// Attended" counts on profiles. Each badge is a dimensional emblem — a
// faceted host-crystal / a disco orb — with an iridescent core that slowly
// rotates (conic sheen), SVG-cut facets, spherical shading and a light sweep.
// Reuses the app's `shine` keyframe + Tailwind's built-in `spin`.
//
// `variant` picks the emblem + colour story; everything else is data.
const VARIANTS = {
  hosted: {
    Icon: PartyPopper,
    shape: "gem",
    conic:
      "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #fbcfe8, #fde68a)",
    ink: "#4a1d52", // deep plum, reads on the pastel holo
    glow: "rgba(217, 70, 239, 0.45)",
  },
  attended: {
    Icon: Sparkles,
    shape: "orb",
    conic:
      "conic-gradient(from 0deg, #a5f3fc, #67e8f9, #a5b4fc, #d8b4fe, #f0abfc, #99f6e4, #a5f3fc)",
    ink: "#13294b", // deep navy
    glow: "rgba(56, 189, 248, 0.42)",
  },
};

const HEX = "polygon(50% 2%, 93% 27%, 93% 73%, 50% 98%, 7% 73%, 7% 27%)";

// Cut-gem facets: a fan of triangles from the centre, alternating light/dark
// over the rotating sheen, plus a brighter inner table.
function GemFacets() {
  const tri = [
    "50,50 50,2 93,27",
    "50,50 93,27 93,73",
    "50,50 93,73 50,98",
    "50,50 50,98 7,73",
    "50,50 7,73 7,27",
    "50,50 7,27 50,2",
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 w-full h-full">
      {tri.map((p, i) => (
        <polygon key={i} points={p} fill={i % 2 ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.22)"} />
      ))}
      <polygon points="50,26 71.5,38.5 71.5,61.5 50,74 28.5,61.5 28.5,38.5" fill="rgba(255,255,255,0.24)" />
    </svg>
  );
}

export default function ProfileBadge({ variant = "attended", value, label }) {
  const v = VARIANTS[variant] || VARIANTS.attended;
  const { Icon } = v;
  const isGem = v.shape === "gem";
  const shapeStyle = isGem ? { clipPath: HEX } : { borderRadius: "9999px" };
  const text = String(value ?? 0);
  const numSize = text.length >= 3 ? "text-[24px]" : "text-[34px]";

  return (
    <div className="group flex flex-col items-center text-center gap-3 py-1 select-none">
      <div className="relative" style={{ filter: `drop-shadow(0 12px 18px ${v.glow})` }}>
        <div className="relative grid place-items-center w-[92px] h-[92px] overflow-hidden isolate" style={shapeStyle}>
          {/* rotating iridescent core */}
          <div className="absolute inset-[-25%] animate-spin [animation-duration:9s]" style={{ background: v.conic }} />

          {/* facets */}
          {isGem ? (
            <GemFacets />
          ) : (
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                background:
                  "repeating-linear-gradient(0deg, transparent 0 9px, rgba(0,0,0,0.16) 9px 10px), repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.16) 9px 10px)",
              }}
            />
          )}

          {/* spherical highlight + edge vignette for 3D roundness */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(42% 38% at 30% 24%, rgba(255,255,255,0.78), rgba(255,255,255,0) 60%), radial-gradient(110% 110% at 50% 55%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.42) 100%)",
            }}
          />

          {/* light sweep */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent animate-shine" />
          </div>

          {/* the integrated count */}
          <span
            className={`relative font-heading font-black ${numSize} leading-none tabular-nums`}
            style={{ color: v.ink, textShadow: "0 1px 0 rgba(255,255,255,0.45)" }}
          >
            {text}
          </span>
        </div>

        {/* emblem chip, outside the clip so its ring shows */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 grid place-items-center w-7 h-7 rounded-full overflow-hidden ring-2 ring-background">
          <div className="absolute inset-0 animate-spin [animation-duration:9s]" style={{ background: v.conic }} />
          <Icon className="relative w-3.5 h-3.5" strokeWidth={2.5} style={{ color: v.ink }} />
        </div>
      </div>

      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">{label}</p>
    </div>
  );
}
