// Emails the host a confirmation right after they create an event: the
// details as saved, the share link, and where to manage it. Invoked by the
// client (fire-and-forget) once the create flow has finished, so a failed
// send never blocks event creation. The recipient is always the caller, who
// must be the event's host (events.host_id).
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import {
  appOrigin, brandedEmail, detailRows, emailCard, escapeHtml, formatEventDateLong,
  formatTimeRange, sendEmail,
} from '../_shared/email.ts';
import { formatMoney } from '../_shared/tickets.ts';

// Only events created within this window are confirmed; re-invoking later is
// a no-op so the endpoint cannot be used to re-send the email indefinitely.
const RECENT_MS = 15 * 60 * 1000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!user.email) return json({ sent: false, error: 'No email on profile' });

    const body = await req.json().catch(() => ({}));
    const eventId = typeof body.event_id === 'string' ? body.event_id : '';
    if (!eventId) return json({ error: 'event_id is required' }, 400);

    const { data: event } = await svc.from('events')
      .select(`id, host_id, business_id, title, date, start_time, end_time, timezone,
        venue_name, address, dress_code, capacity, status, is_paid, currency,
        is_public, invite_code, created_at`)
      .eq('id', eventId).maybeSingle();
    if (!event) return json({ error: 'Event not found' }, 404);
    if (event.host_id !== user.id) return json({ error: 'Only the host can be notified' }, 403);

    const age = Date.now() - new Date(event.created_at).getTime();
    if (!(age >= 0 && age <= RECENT_MS)) return json({ ok: true, skipped: 'not recent' });

    const [{ data: business }, { data: tiers }] = await Promise.all([
      event.business_id
        ? svc.from('business_accounts').select('business_name').eq('id', event.business_id).maybeSingle()
        : Promise.resolve({ data: null }),
      svc.from('ticket_tiers').select('name, price_minor, quantity')
        .eq('event_id', event.id).order('sort_order').order('created_at'),
    ]);

    const published = event.status === 'published';
    const origin = appOrigin();
    const eventUrl = `${origin}/event/${event.id}`;
    const editUrl = `${origin}/event/${event.id}/edit`;
    const guestlistUrl = `${origin}/event/${event.id}/guestlist`;
    const analyticsUrl = `${origin}/event/${event.id}/analytics`;
    const inviteUrl = `${origin}/invite/${event.invite_code}`;

    const venue = [event.venue_name, event.address].filter(Boolean).join(' · ');
    const tierLines = (tiers ?? []).map((t) =>
      `${t.name} — ${t.price_minor > 0 ? formatMoney(t.price_minor, event.currency) : 'Free'}` +
      `${t.quantity > 0 ? ` × ${t.quantity}` : ''}`);
    const detailsCard = emailCard('Event details', detailRows([
      ['📅 Date', formatEventDateLong(event.date)],
      ['🕐 Time', formatTimeRange(event)],
      ['📍 Venue', venue],
      ['👔 Dress code', event.dress_code],
      ['👥 Capacity', event.capacity ? String(event.capacity) : ''],
      ['🎟️ Tickets', tierLines.length ? tierLines.join('; ') : (event.is_paid ? 'Paid' : 'Free entry')],
      ['🏢 Hosted as', business?.business_name ?? ''],
      ['🔔 Status', published ? 'Published' : 'Draft'],
    ]));

    const shareCard = published
      ? emailCard('Share with guests',
        `<p style="margin:0 0 8px;font-size:14px;color:#e8e8f0;line-height:1.6;">Send this link to anyone you want at the door${event.is_public ? '' : ' — it is the only way in for a private event'}.</p>
         <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${inviteUrl}" style="color:#7c3aed;">${escapeHtml(inviteUrl)}</a></p>`)
      : emailCard('Next step',
        `<p style="margin:0;font-size:14px;color:#e8e8f0;line-height:1.6;">Your event is saved as a draft and is not visible to guests yet. Publish it from the event page when you are ready.</p>`);

    const result = await sendEmail({
      to: user.email,
      subject: published ? `Your event is live: ${event.title}` : `Draft saved: ${event.title}`,
      html: brandedEmail({
        kicker: 'Event Created',
        title: event.title,
        subtitle: user.full_name
          ? `Hi ${user.full_name}, ${published ? 'your event is published.' : 'your draft has been saved.'}`
          : (published ? 'Your event is published.' : 'Your draft has been saved.'),
        bodyHtml: detailsCard + shareCard,
        buttons: [
          { label: 'View Event', href: eventUrl },
          {
            label: published ? 'Manage Guestlist' : 'Edit Event',
            href: published ? guestlistUrl : editUrl,
            secondary: true,
          },
        ],
        footnote: `<a href="${editUrl}" style="color:#7a7a9a;">Edit details</a> · <a href="${guestlistUrl}" style="color:#7a7a9a;">Guestlist</a> · <a href="${analyticsUrl}" style="color:#7a7a9a;">Analytics</a>`,
      }),
    });
    return json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('notifyEventCreated error', msg);
    return json({ error: msg }, 500);
  }
});
