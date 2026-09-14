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
