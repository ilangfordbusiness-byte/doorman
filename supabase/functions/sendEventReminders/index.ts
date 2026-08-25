// Daily reminder emails for events happening today, tomorrow, or in 7 days.
// Triggered by pg_cron; guarded by AUTOMATION_SECRET. verify_jwt=false.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import { appOrigin, escapeHtml, sendEmail } from '../_shared/email.ts';

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
      const label = isToday ? 'TODAY' : isTomorrow ? 'TOMORROW' : 'in 7 days';
      const emoji = isToday ? '🎉' : isTomorrow ? '⏰' : '📅';

      const { data: guests } = await svc.from('guestlist_entries')
        .select('guest_email, guest_name')
        .eq('event_id', event.id)
        .in('status', ['approved', 'invited', 'checked_in']);
      if (!guests?.length) continue;

      const eventUrl = `${appOrigin()}/event/${event.id}`;
      const passUrl = `${appOrigin()}/pass/${event.id}`;
      const fmt = (t: unknown) => typeof t === 'string' ? t.slice(0, 5) : '';

      const results = await Promise.allSettled(guests.map((guest) =>
        sendEmail({
          to: guest.guest_email,
          subject: `${emoji} Reminder: ${event.title} is ${label}!`,
          html: `
Hi ${escapeHtml(guest.guest_name || 'there')},<br><br>
This is a friendly reminder that <strong>${escapeHtml(event.title)}</strong> is happening <strong>${label}</strong>!<br><br>
📅 Date: ${escapeHtml(event.date)}<br>
🕐 Time: ${escapeHtml(fmt(event.start_time))}${event.end_time ? ` – ${escapeHtml(fmt(event.end_time))}` : ''}<br>
${event.venue_name ? `📍 Venue: ${escapeHtml(event.venue_name)}<br>` : ''}
${event.address ? `🗺️ Address: ${escapeHtml(event.address)}<br>` : ''}
${event.dress_code ? `👔 Dress Code: ${escapeHtml(event.dress_code)}<br>` : ''}
${event.entry_notes ? `📋 Entry Notes: ${escapeHtml(event.entry_notes)}<br>` : ''}
<div style="margin-top:16px;">
  <a href="${passUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:8px;">Open QR Pass</a>
  <a href="${eventUrl}" style="display:inline-block;padding:10px 20px;background:#1f1f2e;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;border:1px solid #444;">Event Details</a>
</div><br>
See you there! 🙌<br>— DoorMan`.trim(),
        })
      ));
      totalNotified += results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    }

    return json({ ok: true, events: events.length, notified: totalNotified });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
