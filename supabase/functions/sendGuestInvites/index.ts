// Emails an event invite to a list of addresses on the host's behalf. Paired
// with the auto-approve allowlist: the recipient taps through, signs in, joins,
// and the apply_auto_approve trigger puts them straight on the approved list.
// Only a manager of the event may send these.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { appOrigin, brandedEmail, emailCard, sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { event_id, emails } = await req.json().catch(() => ({}));
    if (!event_id || !Array.isArray(emails) || !emails.length) {
      return json({ error: 'event_id and a non-empty emails array are required' }, 400);
    }

    const { data: ev } = await svc.from('events')
      .select('id, title, host_id, business_id, is_public, invite_code').eq('id', event_id).single();
    if (!ev) return json({ error: 'Event not found' }, 404);

    // Manager check: host, accepted co-host, or business owner/member.
    let manager = ev.host_id === user.id;
    if (!manager) {
      const { count } = await svc.from('event_co_hosts').select('id', { count: 'exact', head: true })
        .eq('event_id', event_id).eq('status', 'accepted')
        .or(`user_id.eq.${user.id},email.eq.${user.email}`);
      manager = (count ?? 0) > 0;
    }
    if (!manager && ev.business_id) {
      const { data: biz } = await svc.from('business_accounts').select('owner_id').eq('id', ev.business_id).maybeSingle();
      manager = biz?.owner_id === user.id;
      if (!manager) {
        const { count } = await svc.from('business_members').select('id', { count: 'exact', head: true })
          .eq('business_id', ev.business_id).eq('status', 'accepted')
          .or(`user_id.eq.${user.id},email.eq.${user.email}`);
        manager = (count ?? 0) > 0;
      }
    }
    if (!manager) return json({ error: 'Only the host can invite guests' }, 403);

    // Public events share the event page; private ones share the invite link
    // (which authorises the signed-out preview and the join).
    const link = ev.is_public ? `${appOrigin()}/event/${ev.id}` : `${appOrigin()}/invite/${ev.invite_code}`;
    const recipients = [...new Set(
      emails.map((e: unknown) => String(e ?? '').trim().toLowerCase()).filter((e: string) => e.includes('@')),
    )];
    if (!recipients.length) return json({ ok: true, sent: 0, total: 0 });

    let sent = 0;
    for (const to of recipients) {
      const result = await sendEmail({
        to,
        subject: `You're invited: ${ev.title}`,
        html: brandedEmail({
          kicker: "You're invited",
          title: ev.title,
          subtitle: 'You’ve been added to the list for this event.',
          bodyHtml: emailCard(
            'Accept your invite',
            `<p style="margin:0;font-size:14px;color:#e8e8f0;line-height:1.6;">Tap below, sign in, and join — you’ll be approved automatically and your pass will be waiting in the app.</p>`,
          ),
          buttons: [{ label: 'View & accept', href: link }],
        }),
      });
      if (result?.sent) sent++;
    }
    return json({ ok: true, sent, total: recipients.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('sendGuestInvites error', msg);
    return json({ error: msg }, 500);
  }
});
