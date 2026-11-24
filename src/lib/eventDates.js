import { timeSuffix } from "@/lib/eventTime";

// Guest-facing date and time wording: weekday in full, 12-hour times.

// "22:00" -> "10pm", "22:30" -> "10:30pm".
export function time12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

// The event's own calendar date (a wall date, no zone shift): "Friday 12 December".
export function eventLongDate(event) {
  if (!event?.date) return "";
  const d = new Date(`${String(event.date).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(event.date);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// "10pm – 3am" (+ " GMT" when the viewer is in another zone).
export function eventTimeRange(event) {
  const a = time12(event?.start_time);
  if (!a) return "";
  const b = time12(event?.end_time);
  return `${a}${b ? ` – ${b}` : ""}${timeSuffix(event)}`;
}

// A moment in the viewer's own zone: "Friday 27 November, 6pm".
export function longDateTime(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day}, ${time12(hh)}`;
}
