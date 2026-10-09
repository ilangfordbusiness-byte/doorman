// Event time-zone helpers for the SPA. Events carry the IANA zone their
// date/start_time/end_time are written in (events.timezone, default
// Europe/London); the browser's own zone is what a viewer sees.
export const DEFAULT_TZ = "Europe/London";

export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Short curated list for browsers without Intl.supportedValuesOf.
const CURATED = [
  "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Lisbon", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto",
  "Asia/Dubai", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland",
];

// Every zone the browser knows (or the curated set), with `current` first when
// it is not already there so a saved value always stays selectable.
export function zoneOptions(current) {
  let list = [];
  try {
    list = Intl.supportedValuesOf("timeZone");
  } catch {
    list = [];
  }
  if (!list.length) list = CURATED;
  if (current && !list.includes(current)) list = [current, ...list];
  return list;
}

export function eventZone(event) {
  const tz = event?.timezone;
  return typeof tz === "string" && tz && isValidZone(tz) ? tz : DEFAULT_TZ;
}

// "BST", "EDT", "CEST" for `tz` on `date` (midday, so DST is settled). US
// zones read better in en-US ("EDT"), everything else in en-GB ("BST").
export function zoneAbbrev(tz, date) {
  try {
    const at = date ? new Date(`${date}T12:00:00Z`) : new Date();
    const locale = tz.startsWith("America/") ? "en-US" : "en-GB";
    return new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
      .formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

// " EDT" to append to an event's times — only when the viewer is in a
// different zone, so local events stay uncluttered.
export function timeSuffix(event) {
  const tz = eventZone(event);
  if (tz === browserZone()) return "";
  const a = zoneAbbrev(tz, event?.date);
  return a ? ` ${a}` : "";
}

// Epoch ms for a wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm") read in
// IANA `tz`. DST-safe via a single offset correction. null when date is unusable.
function zonedWallToTs(date, time, tz) {
  if (!date) return null;
  const [y, mo, d] = String(date).split("-").map(Number);
  const [h, mi] = String(time || "00:00").split(":").map(Number);
  if (!y || !mo || !d) return null;
  const asUTC = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(asUTC));
    const m = {};
    parts.forEach((p) => { m[p.type] = p.value; });
    let hh = Number(m.hour);
    if (hh === 24) hh = 0; // some engines render midnight as 24
    const shown = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hh, Number(m.minute), Number(m.second));
    return asUTC - (shown - asUTC);
  } catch {
    return asUTC;
  }
}

// Epoch ms the event starts (its date + start_time, in its own zone), or null.
export function eventStartTs(event) {
  return zonedWallToTs(event?.date, event?.start_time, eventZone(event));
}

// Epoch ms the event ends, or null when no end_time. An end before the start
// is treated as the next day (e.g. a club night ending at 03:00).
export function eventEndTs(event) {
  if (!event?.end_time) return null;
  const start = eventStartTs(event);
  let end = zonedWallToTs(event?.date, event?.end_time, eventZone(event));
  if (start != null && end != null && end < start) end += 24 * 60 * 60 * 1000;
  return end;
}
