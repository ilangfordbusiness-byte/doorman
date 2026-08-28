// Daily reminder emails for events happening today, tomorrow, or in 7 days.
// Triggered by pg_cron; guarded by AUTOMATION_SECRET. verify_jwt=false.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import {
  appOrigin, brandedEmail, detailRows, emailCard, formatEventDateLong, formatTimeRange, sendEmail,
} from '../_shared/email.ts';

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const svc = serviceClient();

    const dayStr = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    };
    const todayStr = dayStr(0);
    const tomorrowStr = dayStr(1);
    const in7Str = dayStr(7);

    const { data: events } = await svc.from('events').select('*')
      .eq('status', 'published')
      .in('date', [todayStr, tomorrowStr, in7Str]);
    if (!events?.length) return json({ ok: true, skipped: 'no upcoming events' });

    let totalNotified = 0;
    for (const event of events) {
      const isToday = event.date === todayStr;
      const isTomorrow = event.date === tomorrowStr;
      const label = isToday ? 'today' : isTomorrow ? 'tomorrow' : 'in 7 days';

      const { data: guests } = await svc.from('guestlist_entries')
        .select('guest_email, guest_name')
        .eq('event_id', event.id)
        .in('status', ['approved', 'invited', 'checked_in']);
      if (!guests?.length) continue;

      const eventUrl = `${appOrigin()}/event/${event.id}`;
      const passUrl = `${appOrigin()}/pass/${event.id}`;

      const results = await Promise.allSettled(guests.map((guest) =>
        sendEmail({
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
