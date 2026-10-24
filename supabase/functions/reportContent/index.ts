// Report objectionable content: an event, a chat message, or a user.
//
// Stores the report in content_reports and emails the moderation inbox
// (MODERATION_EMAIL, default contact@thedoorman.app) so it is acted on within
// 24 hours, as App Store Guideline 1.2 asks. A message report copies the
// message text into the report, because the sender can delete the message
// later. Each user may file at most REPORTS_PER_HOUR reports, so the inbox
// cannot be flooded.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { appOrigin, brandedEmail, detailRows, emailCard, sendEmail } from '../_shared/email.ts';

const REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'other'];
const REASON_LABELS: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment or bullying', hate: 'Hate speech',
  sexual: 'Sexual content', violence: 'Violence or threats', scam: 'Scam or fraud',
  other: 'Other',
};
const REPORTS_PER_HOUR = 20;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const targetType = String(body.target_type || '');
    const reason = String(body.reason || '');
    const details = String(body.details || '').trim().slice(0, 1000) || null;
    if (!['event', 'message', 'user'].includes(targetType)) {
      return json({ error: 'Invalid target_type' }, 400);
    }
    if (!REASONS.includes(reason)) return json({ error: 'Choose a reason' }, 400);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await svc.from('content_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= REPORTS_PER_HOUR) {
      return json({ error: 'Too many reports. Try again later.' }, 429);
    }

    const row: Record<string, unknown> = {
      reporter_id: user.id, target_type: targetType, reason, details,
    };
    let eventTitle: string | null = null;

    if (targetType === 'message') {
      const { data: msg } = await svc.from('event_messages')
        .select('id, event_id, sender_id, text').eq('id', String(body.message_id || ''))
        .maybeSingle();
      if (!msg) return json({ error: 'Message not found' }, 404);
      Object.assign(row, {
        message_id: msg.id, event_id: msg.event_id,
        reported_user_id: msg.sender_id, message_text: msg.text,
      });
    } else if (targetType === 'event') {
      const { data: ev } = await svc.from('events')
        .select('id, host_id').eq('id', String(body.event_id || '')).maybeSingle();
      if (!ev) return json({ error: 'Event not found' }, 404);
      Object.assign(row, { event_id: ev.id, reported_user_id: ev.host_id });
    } else {
      const { data: target } = await svc.from('profiles')
        .select('id').eq('id', String(body.user_id || '')).maybeSingle();
      if (!target) return json({ error: 'User not found' }, 404);
      if (target.id === user.id) return json({ error: 'You cannot report yourself' }, 400);
      row.reported_user_id = target.id;
      if (body.event_id) row.event_id = String(body.event_id);
    }

    if (row.event_id) {
      const { data: ev } = await svc.from('events').select('title')
        .eq('id', row.event_id).maybeSingle();
      eventTitle = ev?.title ?? null;
    }
    let reportedName: string | null = null;
    if (row.reported_user_id) {
      const { data: p } = await svc.from('profiles').select('full_name, email')
        .eq('id', row.reported_user_id).maybeSingle();
      reportedName = p ? `${p.full_name || ''} <${p.email}>` : null;
    }

    const { data: report, error } = await svc.from('content_reports')
      .insert(row).select('id').single();
    if (error) return json({ error: error.message }, 400);

    const to = Deno.env.get('MODERATION_EMAIL') || 'contact@thedoorman.app';
    const rows: [string, unknown][] = [
      ['Report', report.id],
      ['Type', targetType],
      ['Reason', REASON_LABELS[reason]],
      ['Reporter', `${user.full_name || ''} <${user.email}>`],
    ];
    if (reportedName) rows.push(['Reported user', reportedName]);
    if (eventTitle) rows.push(['Event', `${eventTitle} (${appOrigin()}/event/${row.event_id})`]);
    if (row.message_text) rows.push(['Message', row.message_text]);
    if (details) rows.push(['Details', details]);
    const mail = await sendEmail({
      to,
      subject: `[DoorMan report] ${REASON_LABELS[reason]}: ${targetType}`,
      html: brandedEmail({
        kicker: 'Content Report',
        title: 'New report to review',
        subtitle: 'Review within 24 hours. Remove the content or ban the user from the Admin page.',
        bodyHtml: emailCard(null, detailRows(rows)),
        buttons: [{ label: 'Open Admin', href: `${appOrigin()}/admin` }],
      }),
    });
    if (!mail.sent) console.log('reportContent: moderation email not sent', mail.error);

    return json({ ok: true, report_id: report.id });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
