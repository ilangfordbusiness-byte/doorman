// Emails all live guests when meaningful event fields change. Triggered by a
// database webhook (pg_net) on events UPDATE; guarded by AUTOMATION_SECRET.
// verify_jwt=false — the secret header is the authentication.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import {
  appOrigin, brandedEmail, detailRows, emailCard, formatEventDateLong, sendEmail, ukTimeSuffix,
} from '../_shared/email.ts';

const RELEVANT_FIELDS = [
  'title', 'date', 'start_time', 'end_time', 'venue_name', 'address',
  'dress_code', 'description', 'entry_notes', 'status',
];

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));

    // Supabase database-webhook payload: { record, old_record, ... }
    const record = body.record ?? {};
    const oldRecord = body.old_record ?? {};
    if (!record.id) return json({ ok: true, skipped: 'no record' });

    const changed = RELEVANT_FIELDS.filter((f) => record[f] !== oldRecord[f]);
    if (!changed.length) return json({ ok: true, skipped: 'no relevant change' });

    const svc = serviceClient();
    // Re-fetch from the DB so displayed values come from a real row.
    const { data: event } = await svc.from('events').select('*').eq('id', record.id).single();
    if (!event) return json({ ok: true, skipped: 'event not found' });

    const { data: guests } = await svc.from('guestlist_entries')
      .select('guest_email, guest_name')
      .eq('event_id', event.id)
      .in('status', ['approved', 'invited', 'checked_in']);
    if (!guests?.length) return json({ ok: true, skipped: 'no guests' });

    const fmt = (t: unknown) =>
      typeof t === 'string' ? t.slice(0, 5) + ukTimeSuffix(event.date) : String(t ?? '');
    const rows: [string, unknown][] = [];
    if (changed.includes('title')) rows.push(['Title', event.title]);
    if (changed.includes('date')) rows.push(['Date', formatEventDateLong(event.date)]);
    if (changed.includes('start_time')) rows.push(['Start time', fmt(event.start_time)]);
    if (changed.includes('end_time')) rows.push(['End time', fmt(event.end_time)]);
    if (changed.includes('venue_name')) rows.push(['Venue', event.venue_name]);
    if (changed.includes('address')) rows.push(['Address', event.address]);
    if (changed.includes('dress_code')) rows.push(['Dress code', event.dress_code]);
    if (changed.includes('entry_notes')) rows.push(['Entry notes', event.entry_notes]);
    if (changed.includes('status')) rows.push(['Status', event.status]);
    const cardBody = rows.length
      ? detailRows(rows)
      : `<p style="margin:0;font-size:14px;color:#e8e8f0;line-height:1.6;">The host has updated event details. Check the event page for more info.</p>`;

    const eventUrl = `${appOrigin()}/event/${event.id}`;
    const results = await Promise.allSettled(guests.map((guest) =>
      sendEmail({
        to: guest.guest_email,
        subject: `Update: ${event.title}`,
        html: brandedEmail({
          kicker: 'Event Update',
          title: event.title,
          subtitle: guest.guest_name
            ? `Hi ${guest.guest_name}, the host has updated this event.`
            : 'The host has updated this event.',
          bodyHtml: emailCard('What changed', cardBody),
          buttons: [{ label: 'View Event', href: eventUrl }],
        }),
      })
    ));
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    return json({ ok: true, notified: sent, guests: guests.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
