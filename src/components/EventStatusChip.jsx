import { eventStartTs, eventEndTs } from "@/lib/eventTime";
import { tierRemaining, tierSoldOut } from "@/lib/tiers";

// A pulsing neon status tag driven by real ticket data: LIVE NOW while the event
// is on, then SOLD OUT / LAST N LEFT / SELLING FAST for paid events. Renders
// nothing when none apply. Needs the event's ticket `tiers` for the sold states.
const TONES = {
  cyan: "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
  pink: "text-pink-300 border-pink-400/40 bg-pink-400/10",
  amber: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  muted: "text-muted-foreground border-border bg-secondary/60",
};
const DOT = { cyan: "hsl(180 100% 50%)", pink: "hsl(330 100% 62%)", amber: "hsl(38 95% 55%)" };

export default function EventStatusChip({ event, tiers = [], className = "" }) {
  const now = Date.now();
  const start = eventStartTs(event);
  const end = eventEndTs(event) ?? (start != null ? start + 6 * 3600 * 1000 : null);
  const liveNow = start != null && now >= start && end != null && now <= end;

  const paid = !!event?.is_paid && tiers.length > 0;
  const capacity = tiers.reduce((s, t) => s + Number(t.quantity || 0), 0);
  const remaining = tiers.reduce((s, t) => s + tierRemaining(t), 0);
  const allSoldOut = paid && tiers.every(tierSoldOut);
  const soldFraction = capacity > 0 ? 1 - remaining / capacity : 0;

  let chip = null;
  if (liveNow) chip = { label: "LIVE NOW", tone: "cyan", pulse: true };
  else if (allSoldOut) chip = { label: "SOLD OUT", tone: "muted", pulse: false };
  else if (paid && remaining > 0 && remaining <= 10) chip = { label: `LAST ${remaining} LEFT`, tone: "amber", pulse: true };
  else if (paid && soldFraction >= 0.7) chip = { label: "SELLING FAST", tone: "pink", pulse: true };
  if (!chip) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full border ${TONES[chip.tone]} ${className}`}>
      {chip.pulse && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse motion-reduce:animate-none" style={{ background: DOT[chip.tone], boxShadow: `0 0 8px ${DOT[chip.tone]}` }} />
      )}
      {chip.label}
    </span>
  );
}
