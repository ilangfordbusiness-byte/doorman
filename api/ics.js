// GET /api/ics?id=<event id>: an .ics file for a published public event.
//
// iOS opens a text/calendar response from a real HTTPS link straight into
// Calendar's "Add event" sheet, which a blob download can't do inside the
// app's WebView. The web app builds the same file client-side
// (src/lib/calendar.js); keep the two in step. Reads only public data with the
// anon key: the event row (RLS: published + public) and the masked location
// (get_events_location, which hides venues the host keeps until approval).

const DOMAIN = "https://thedoorman.app";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const DEFAULT_LENGTH_MS = 5 * 60 * 60 * 1000;

const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s ?? "").replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

// Wall-clock date + time in IANA zone -> epoch ms (same as src/lib/eventTime.js).
function zonedWallToTs(date, time, tz) {
  if (!date) return null;
  const [y, mo, d] = String(date).split("-").map(Number);
  const [h, mi] = String(time || "00:00").split(":").map(Number);
  if (!y || !mo || !d) return null;
  const asUTC = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "Europe/London", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(asUTC));
    const m = {};
    parts.forEach((p) => { m[p.type] = p.value; });
    let hh = Number(m.hour);
    if (hh === 24) hh = 0;
    const shown = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hh, Number(m.minute), Number(m.second));
    return asUTC - (shown - asUTC);
  } catch {
    return asUTC;
  }
}

export default async function handler(req, res) {
  const id = new URL(req.url, DOMAIN).searchParams.get("id") || "";
  const fail = (code, msg) => { res.statusCode = code; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(msg); };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Missing or invalid event id");
  if (!SUPABASE_URL || !ANON) return fail(500, "Not configured");

  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  let ev = null;
  let loc = null;
  try {
    const [evRes, locRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${id}&select=id,title,date,start_time,end_time,timezone,entry_notes&limit=1`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_events_location`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ p_event_ids: [id] }),
      }),
    ]);
    const rows = evRes.ok ? await evRes.json() : [];
    ev = Array.isArray(rows) ? rows[0] : null;
    const locs = locRes.ok ? await locRes.json() : [];
    loc = Array.isArray(locs) ? locs[0] : null;
  } catch {
    return fail(502, "Couldn't load the event");
  }
  if (!ev) return fail(404, "Event not found");

  const start = zonedWallToTs(ev.date, String(ev.start_time || "").slice(0, 5), ev.timezone);
  if (start == null) return fail(404, "Event has no date");
  let end = ev.end_time ? zonedWallToTs(ev.date, String(ev.end_time).slice(0, 5), ev.timezone) : null;
  if (end != null && end < start) end += 24 * 60 * 60 * 1000;
  if (end == null) end = start + DEFAULT_LENGTH_MS;

  const url = `${DOMAIN}/event/${ev.id}`;
  const place = [loc?.venue_name, loc?.address].filter(Boolean).join(", ");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DoorMan//Event//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@thedoorman.app`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(ev.title)}`,
    place ? `LOCATION:${icsText(place)}` : null,
    `DESCRIPTION:${icsText([ev.entry_notes, url].filter(Boolean).join("\n"))}`,
    `URL:${url}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const file = `${String(ev.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${file}"`);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.end(ics);
}
