// Emails all live guests when meaningful event fields change. Triggered by a
// database webhook (pg_net) on events UPDATE; guarded by AUTOMATION_SECRET.
// verify_jwt=false — the secret header is the authentication.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import { appOrigin, escapeHtml, sendEmail } from '../_shared/email.ts';

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

    const fmt = (t: unknown) => typeof t === 'string' ? t.slice(0, 5) : String(t ?? '');
    const changes: string[] = [];
    if (changed.includes('date')) changes.push(`📅 Date changed to: ${event.date}`);
    if (changed.includes('start_time')) changes.push(`🕐 Start time changed to: ${fmt(event.start_time)}`);
    if (changed.includes('end_time')) changes.push(`🕐 End time changed to: ${fmt(event.end_time)}`);
    if (changed.includes('venue_name')) changes.push(`📍 Venue changed to: ${event.venue_name}`);
    if (changed.includes('address')) changes.push(`🗺️ Address changed to: ${event.address}`);
    if (changed.includes('dress_code')) changes.push(`👔 Dress code changed to: ${event.dress_code}`);
    if (changed.includes('entry_notes')) changes.push(`📋 Entry notes updated: ${event.entry_notes}`);
    if (changed.includes('status')) changes.push(`🔔 Event status changed to: ${event.status}`);
    if (!changes.length) {
      changes.push('The host has updated event details. Check the event page for more info.');
    }

    const eventUrl = `${appOrigin()}/event/${event.id}`;
    const results = await Promise.allSettled(guests.map((guest) =>
      sendEmail({
        to: guest.guest_email,
        subject: `🔔 Update: ${event.title}`,
        html: `
Hi ${escapeHtml(guest.guest_name || 'there')},<br><br>
The host has made updates to <strong>${escapeHtml(event.title)}</strong>:<br><br>
${changes.map((c) => `• ${escapeHtml(c)}`).join('<br>')}<br>
<a href="${eventUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">View Event</a><br><br>
— DoorMan`.trim(),
      })
    ));
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    return json({ ok: true, notified: sent, guests: guests.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
