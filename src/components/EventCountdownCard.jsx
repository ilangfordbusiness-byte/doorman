import { useEffect, useState } from "react";
import { eventStartTs, eventEndTs } from "@/lib/eventTime";
import { longDateTime } from "@/lib/eventDates";

const GLOW = { textShadow: "0 0 10px hsl(185 90% 55% / 0.55), 0 0 22px hsl(185 90% 55% / 0.3)" };
const pad = (n) => String(n).padStart(2, "0");
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Guest-page countdown. Counts to the ticket release first (when tickets
// aren't on sale yet), otherwise to doors. Until the day itself it shows
// whole days ("17 days"); on the day it becomes a live hours:minutes:seconds
// clock. While the event is on it says "Happening now"; afterwards, nothing.
export default function EventCountdownCard({ event, releaseAt = null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = eventStartTs(event);
  if (start == null) return null;
  const end = eventEndTs(event) ?? start + 6 * 3600 * 1000;
  const release = releaseAt ? new Date(releaseAt).getTime() : null;
  const target = release && release > now ? release : start;
  const label = target === release ? "Tickets go on sale in" : "Doors open in";

  if (target === start && now >= start) {
    if (now > end) return null;
    return (
      <div className="rounded-[20px] border border-cyan-400/25 bg-gradient-to-br from-cyan-400/10 via-secondary/30 to-primary/10 p-4 flex items-center justify-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-cyan-300 animate-pulse motion-reduce:animate-none" />
        <span className="font-mono uppercase tracking-[0.2em] text-sm font-bold text-cyan-100" style={GLOW}>Happening now</span>
      </div>
    );
  }

  const sameDay = dayStart(now) === dayStart(target);
  const ms = Math.max(0, target - now);
  const days = Math.round((dayStart(target) - dayStart(now)) / 864e5);

  return (
    <div className="rounded-[20px] border border-cyan-400/25 bg-gradient-to-br from-cyan-400/10 via-secondary/30 to-primary/10 px-4 py-4 text-center">
      <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/90">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse motion-reduce:animate-none" />
        {label}
      </p>
      {sameDay ? (
        <div className="mt-2 flex items-start justify-center gap-2 font-mono" style={GLOW} aria-live="off">
          <Unit value={pad(Math.floor(ms / 3.6e6))} label="HRS" />
          <p className="text-[34px] leading-none text-cyan-100/50">:</p>
          <Unit value={pad(Math.floor(ms / 6e4) % 60)} label="MIN" />
          <p className="text-[34px] leading-none text-cyan-100/50">:</p>
          <Unit value={pad(Math.floor(ms / 1e3) % 60)} label="SEC" />
        </div>
      ) : (
        <p className="mt-2">
          <span className="font-mono font-bold text-[44px] leading-none text-cyan-50" style={GLOW}>{days}</span>
          <span className="font-mono text-[15px] uppercase tracking-[0.2em] text-cyan-100/70 ml-1.5">{days === 1 ? "day" : "days"}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{longDateTime(target)}</p>
    </div>
  );
}

function Unit({ value, label }) {
  return (
    <div>
      <p className="font-bold text-[40px] leading-none text-cyan-50 tabular-nums">{value}</p>
      <p className="text-[10px] tracking-[0.2em] text-cyan-100/55 mt-1">{label}</p>
    </div>
  );
}
