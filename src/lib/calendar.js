import { eventStartTs, eventEndTs } from "@/lib/eventTime";

// "Add to calendar" and "Open in Maps" for an event. The .ics is built here so
// it works for any event the viewer can see (private ones included); iOS opens
// the same file from api/ics so Calendar's "Add event" sheet appears, which a
// blob download can't do inside the app's WebView.

const DEFAULT_LENGTH_MS = 5 * 60 * 60 * 1000;

// 20261212T220000Z
const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545 text escaping (backslash, comma, semicolon, newline).
const icsText = (s) => String(s ?? "").replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

export function eventPlace(event) {
  return [event?.venue_name, event?.address].filter(Boolean).join(", ");
}

// Start/end epoch ms (end falls back to start + 5h, like a typical night).
export function eventSpan(event) {
  const start = eventStartTs(event);
  if (start == null) return null;
  return { start, end: eventEndTs(event) ?? start + DEFAULT_LENGTH_MS };
}

export function buildIcs(event, url) {
  const span = eventSpan(event);
  if (!span) return null;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DoorMan//Event//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@thedoorman.app`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(span.start)}`,
    `DTEND:${icsStamp(span.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    eventPlace(event) ? `LOCATION:${icsText(eventPlace(event))}` : null,
    `DESCRIPTION:${icsText([event.entry_notes, url].filter(Boolean).join("\n"))}`,
    url ? `URL:${url}` : null,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function downloadIcs(event, url) {
  const ics = buildIcs(event, url);
  if (!ics) return false;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${String(event.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

// Google Calendar "create event" link: the fallback where a file can't open.
export function googleCalendarUrl(event, url) {
  const span = eventSpan(event);
  if (!span) return null;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "",
    dates: `${icsStamp(span.start)}/${icsStamp(span.end)}`,
    details: [event.entry_notes, url].filter(Boolean).join("\n"),
    location: eventPlace(event),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// Google Maps search for the venue: opens the Maps app on phones that have it.
export function mapsUrl(event) {
  const q = eventPlace(event);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
