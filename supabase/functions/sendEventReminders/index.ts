// Daily reminder emails for events happening today, tomorrow, or in 7 days.
// Triggered by pg_cron; guarded by AUTOMATION_SECRET. verify_jwt=false.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import {
  appOrigin, brandedEmail, detailRows, emailCard, formatEventDateLong, formatTimeRange, sendEmail,
} from '../_shared/email.ts';
import { daysUntil, eventZone, localDate } from '../_shared/eventTime.ts';

const LABELS: Record<number, string> = { 0: 'today', 1: 'tomorrow', 7: 'in 7 days' };

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const svc = serviceClient();

    // "Today" is the event's own calendar day, so fetch a loose UTC window and
    // pick the 0 / 1 / 7-day matches per event zone.
    const now = new Date();
    const utcDay = (offset: number) =>
      new Date(now.getTime() + offset * 86_400_000).toISOString().split('T')[0];
    const { data: candidates } = await svc.from('events').select('*')
      .eq('status', 'published')
      .gte('date', utcDay(-1))
      .lte('date', utcDay(8));
    const events = (candidates ?? [])
      .map((event) => ({ event, offset: daysUntil(event.date, localDate(eventZone(event), now)) }))
      .filter(({ offset }) => offset in LABELS);
    if (!events.length) return json({ ok: true, skipped: 'no upcoming events' });

    let totalNotified = 0;
    for (const { event, offset } of events) {
      const label = LABELS[offset];

      const { data: guests } = await svc.from('guestlist_entries')
        .select('guest_email, guest_name')
        .eq('event_id', event.id)
        .in('status', ['approved', 'invited', 'checked_in']);
      if (!guests?.length) continue;

      const eventUrl = `${appOrigin()}/event/${event.id}`;
      const passUrl = `${appOrigin()}/pass/${event.id}`;

      const results = await Promise.allSettled(guests.map((guest) =>
        sendEmail({
          bulk: true,
          to: guest.guest_email,
          subject: `Reminder: ${event.title} is ${label}`,
          html: brandedEmail({
            kicker: 'Event Reminder',
            title: event.title,
            subtitle: `${guest.guest_name ? `Hi ${guest.guest_name}, this` : 'This'} event is happening ${label}.`,
            bodyHtml: emailCard('Event Details', detailRows([
              ['📅 Date', formatEventDateLong(event.date)],
              ['🕐 Time', formatTimeRange(event)],
              ['📍 Venue', event.venue_name],
              ['🗺️ Address', event.address],
              ['👔 Dress code', event.dress_code],
              ['📋 Entry notes', event.entry_notes],
            ])),
            buttons: [
              { label: 'Open QR Pass', href: passUrl },
              { label: 'Event Details', href: eventUrl, secondary: true },
            ],
            footnote: 'See you there! 🙌',
          }),
        })
      ));
      totalNotified += results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    }

    return json({ ok: true, events: events.length, notified: totalNotified });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
