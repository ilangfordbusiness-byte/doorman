import { zoneOptions } from "@/lib/eventTime";

// Picks the IANA zone an event's times are written in. Preset from the host's
// browser on create; every zone the browser knows is offered so a host can
// set up an event somewhere else.
export default function TimeZoneSelect({ value, onChange }) {
  const options = zoneOptions(value);
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Time zone</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Event time zone"
        className="w-full h-12 rounded-xl border border-border bg-secondary/50 px-3 text-sm"
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground mt-1.5">Times above are in this zone. Guests elsewhere see it labelled.</p>
    </div>
  );
}
