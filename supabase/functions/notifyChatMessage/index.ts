// Emails all live guests when the HOST posts in the event chat. Triggered by a
// database webhook (pg_net) on event_messages INSERT; guarded by
// AUTOMATION_SECRET. verify_jwt=false — the secret header is the auth.
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';
import { appOrigin, brandedEmail, emailCard, escapeHtml, sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const record = body.record ?? {};
    if (!record.id || !record.event_id) return json({ ok: true, skipped: 'incomplete payload' });

    const svc = serviceClient();
    // Re-fetch so we act only on a real row.
    const { data: message } = await svc.from('event_messages').select('*')
      .eq('id', record.id).maybeSingle();
    if (!message) return json({ ok: true, skipped: 'message not found' });

    const { data: event } = await svc.from('events').select('*')
      .eq('id', message.event_id).single();
    if (!event) return json({ ok: true, skipped: 'event not found' });

    // Only host messages notify guests.
    if (message.sender_id !== event.host_id) {
      return json({ ok: true, skipped: 'sender is not the host' });
    }

    // Replay guard: only messages from the last 2 minutes.
    const createdMs = message.created_at ? new Date(message.created_at).getTime() : 0;
    if (createdMs && Date.now() - createdMs > 120000) {
      return json({ ok: true, skipped: 'stale message' });
    }

    const { data: host } = await svc.from('profiles').select('full_name, email')
      .eq('id', event.host_id).single();

    const { data: guests } = await svc.from('guestlist_entries')
      .select('guest_email, guest_name, guest_user_id')
      .eq('event_id', message.event_id)
      .in('status', ['approved', 'invited', 'checked_in']);
    const targets = (guests ?? []).filter((g) =>
      g.guest_user_id !== message.sender_id && g.guest_email !== host?.email
    );
    if (!targets.length) return json({ ok: true, skipped: 'no guests' });

    const eventUrl = `${appOrigin()}/event/${event.id}`;
    const senderName = host?.full_name || 'The host';
    const results = await Promise.allSettled(targets.map((guest) =>
      sendEmail({
        to: guest.guest_email,
        subject: `New message from ${senderName} – ${event.title}`,
        html: brandedEmail({
          kicker: 'Event Chat',
          title: event.title,
          subtitle: guest.guest_name ? `Hi ${guest.guest_name},` : undefined,
          bodyHtml: emailCard(
            `Message from ${senderName}`,
            `<p style="margin:0;font-size:15px;color:#e8e8f0;line-height:1.6;border-left:3px solid #7c3aed;padding-left:14px;text-align:left;">${escapeHtml(message.text || '')}</p>`,
          ),
          buttons: [{ label: 'View Event Chat', href: eventUrl }],
        }),
      })
    ));
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
    return json({ ok: true, notified: sent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
