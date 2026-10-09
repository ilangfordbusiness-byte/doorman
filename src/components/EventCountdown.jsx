import { useState, useEffect } from "react";
import { eventStartTs, eventEndTs } from "@/lib/eventTime";

// A neon countdown to an event's start ("doors") on the event page. Ticks every
// second; shows a live "Happening now" state during the event window and renders
// nothing once it's over. Matches the app's purple/cyan glow vocabulary.
const pad = (n) => String(n).padStart(2, "0");

function breakdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

const NUM_GLOW = { textShadow: "0 0 8px hsl(180 100% 50% / 0.55), 0 0 18px hsl(180 100% 50% / 0.3)" };

export default function EventCountdown({ event }) {
  const start = eventStartTs(event);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (start == null) return null;
  const end = eventEndTs(event) ?? start + 6 * 3600 * 1000;

  // During the event window, show a live state instead of a countdown.
  if (now >= start) {
    if (now > end) return null;
    return (
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-secondary/40 to-primary/10 p-4 flex items-center justify-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse motion-reduce:animate-none" style={{ boxShadow: "0 0 8px hsl(180 100% 50%)" }} />
        <span className="font-mono uppercase tracking-[0.2em] text-sm font-bold text-cyan-100" style={NUM_GLOW}>Happening now</span>
      </div>
    );
  }

  const b = breakdown(start - now);
  const segs = [
    ...(b.days > 0 ? [["Days", String(b.days)]] : []),
    ["Hrs", pad(b.hours)],
    ["Min", pad(b.mins)],
    ["Sec", pad(b.secs)],
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-secondary/40 to-accent/10 p-4">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none" style={{ boxShadow: "0 0 6px hsl(180 100% 50%)" }} />
        <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-cyan-200/80">Doors open in</span>
      </div>
      <div className="flex items-end justify-center gap-1.5 sm:gap-2">
        {segs.map(([label, value], i) => (
          <div key={label} className="flex items-end gap-1.5 sm:gap-2">
            {i > 0 && <span className="font-mono text-2xl font-bold text-muted-foreground/40 pb-5 leading-none">:</span>}
            <div className="flex flex-col items-center">
              <span className="font-mono text-3xl sm:text-4xl font-bold text-cyan-100 tabular-nums leading-none" style={NUM_GLOW}>{value}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
