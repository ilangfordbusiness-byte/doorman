// Event wall-clock helpers. An event stores a bare `date` + `start_time` /
// `end_time` plus the IANA `timezone` they are written in (events.timezone,
// default Europe/London for rows created before it existed). Everything that
// asks "has this event started / ended / is it today" goes through here so no
// caller assumes London or UTC.
// deno-lint-ignore-file no-explicit-any

export const DEFAULT_TZ = 'Europe/London';

export function eventZone(event: any): string {
  const tz = event?.timezone;
  if (typeof tz === 'string' && tz && isValidZone(tz)) return tz;
  return DEFAULT_TZ;
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// {year, month, day, hour, minute} of `d` as seen on a wall clock in `tz`.
function partsIn(d: Date, tz: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
}

// "YYYY-MM-DDTHH:MM" wall-clock key in `tz` — sorts as a string against
// `${event.date}T${event.start_time}`.
export function wallClockNow(tz: string, now: Date = new Date()): string {
  const p = partsIn(now, tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Calendar date "YYYY-MM-DD" in `tz`.
export function localDate(tz: string, now: Date = new Date()): string {
  return wallClockNow(tz, now).slice(0, 10);
}

const hhmm = (t: unknown, fallback: string) =>
  typeof t === 'string' && t ? t.slice(0, 5) : fallback;

// Has the event's start passed, on its own clock?
export function eventStarted(event: any, now: Date = new Date()): boolean {
  if (!event?.date) return false;
  const startKey = `${event.date}T${hhmm(event.start_time, '00:00')}`;
  return wallClockNow(eventZone(event), now) >= startKey;
}

// Has the event ended? End time earlier than start is a past-midnight finish;
// we then wait until the day is over, which only delays, never rushes.
export function eventEnded(event: any, now: Date = new Date()): boolean {
  if (!event?.date) return false;
  const start = hhmm(event.start_time, '00:00');
  let end = hhmm(event.end_time, '23:59');
  if (end <= start) end = '23:59';
  return `${event.date}T${end}` < wallClockNow(eventZone(event), now);
}

// Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD).
export function daysUntil(date: string, today: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000);
}

// The instant at which `date` `time` occurs on a wall clock in `tz`. Guess the
// UTC instant with the same digits, read that instant back in `tz`, and shift
// by the difference (a second pass settles the DST-transition hour).
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm(time, '00:00').split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const diff = seen - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

// " BST", " EDT", " CEST" … for the event's zone at its start. US zones read
// better in en-US ("EDT"), everything else in en-GB ("BST", "CEST").
export function timeZoneSuffix(event: any): string {
  try {
    const tz = eventZone(event);
    const at = event?.date ? zonedToUtc(event.date, hhmm(event.start_time, '12:00'), tz) : new Date();
    const locale = tz.startsWith('America/') ? 'en-US' : 'en-GB';
    const name = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
    return name ? ` ${name}` : '';
  } catch {
    return '';
  }
}
