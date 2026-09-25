// Weekly "here are the new events" digest: every account holder gets one email
// listing the public events posted in the last 7 days. Sends nothing when no
// events were posted. Triggered by pg_cron every Thursday; guarded by
// AUTOMATION_SECRET. verify_jwt=false.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import {
  appOrigin, brandedEmail, detailRows, emailCard, escapeHtml, formatEventDateLong,
  formatTimeRange, sendEmail,
} from '../_shared/email.ts';

const WINDOW_DAYS = 7;
const MAX_LISTED = 10;       // events shown in full; the rest are counted
const SEND_CONCURRENCY = 20; // parallel Resend calls per batch

// deno-lint-ignore no-explicit-any
type EventRow = any;

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const svc = serviceClient();

    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
    const today = now.toISOString().split('T')[0];

    // Same visibility rule as the Discover tab: published and either public or
    // listed on Discover. Only upcoming events — nothing that already happened.
    const { data: events, error: eventsError } = await svc.from('events')
      .select('id, title, date, start_time, end_time, timezone, venue_name, address, cover_image_url')
      .eq('status', 'published')
      .or('is_public.eq.true,discoverable.eq.true')
      .gte('published_at', since)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    if (eventsError) throw new Error(eventsError.message);
    if (!events?.length) return json({ ok: true, skipped: 'no new events' });

    const { data: users, error: usersError } = await svc.from('profiles')
      .select('email, full_name')
      .is('banned_at', null);
    if (usersError) throw new Error(usersError.message);
    const recipients = (users ?? []).filter((u) => typeof u.email === 'string' && u.email.includes('@'));
    if (!recipients.length) return json({ ok: true, events: events.length, skipped: 'no recipients' });

    const bodyHtml = digestBody(events);
    const subject = events.length === 1
      ? `New this week: ${events[0].title}`
      : `${events.length} new events posted this week`;

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
      const batch = recipients.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((user) =>
        sendEmail({
          bulk: true,
          to: user.email,
          subject,
          html: brandedEmail({
            kicker: 'New This Week',
            title: events.length === 1 ? 'A new event just dropped' : `${events.length} new events posted`,
            subtitle: `${user.full_name ? `Hi ${user.full_name}, here` : 'Here'} are the events posted on DoorMan in the last ${WINDOW_DAYS} days.`,
            bodyHtml,
            buttons: [{ label: 'Browse all events', href: `${appOrigin()}/guest?tab=discover` }],
            footnote: 'You get this once a week, only when new events have been posted.',
          }),
        })
      ));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.sent) sent += 1;
        else failed += 1;
      }
    }

    return json({ ok: true, events: events.length, recipients: recipients.length, sent, failed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function digestBody(events: EventRow[]): string {
  const origin = appOrigin();
  const cards = events.slice(0, MAX_LISTED).map((event) => {
    const url = `${origin}/event/${event.id}`;
    const cover = event.cover_image_url
      ? `<img src="${escapeHtml(event.cover_image_url)}" alt="${escapeHtml(event.title)}" style="display:block;width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin-bottom:12px;">`
      : '';
    return emailCard(null, `${cover}
      <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#ffffff;">
        <a href="${url}" style="color:#ffffff;text-decoration:none;">${escapeHtml(event.title)}</a>
      </p>
      ${detailRows([
        ['📅 Date', formatEventDateLong(event.date)],
        ['🕐 Time', formatTimeRange(event)],
        ['📍 Venue', event.venue_name],
        ['🗺️ Address', event.address],
      ])}
      <p style="margin:12px 0 0;"><a href="${url}" style="color:#a78bfa;font-weight:600;text-decoration:none;">View event →</a></p>`);
  }).join('');
  const more = events.length > MAX_LISTED
    ? `<p style="margin:16px 0 0;text-align:center;color:#b0b0c8;font-size:14px;">…and ${events.length - MAX_LISTED} more on Discover.</p>`
    : '';
  return cards + more;
}
