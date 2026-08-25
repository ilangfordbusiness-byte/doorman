// Accept or decline a co-host invite. Operates on the event_co_hosts table
// (the Base44 version rewrote a JSON array on the event row).
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { event_id, action } = body;
    if (!event_id) return json({ error: 'Missing event_id' }, 400);

    const { data: invite } = await svc.from('event_co_hosts').select('*')
      .eq('event_id', event_id)
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();
    if (!invite) {
      return json({ error: 'You are not invited as a co-host of this event' }, 403);
    }
    if (invite.status === 'accepted') return json({ ok: true, already: true });

    const { error } = await svc.from('event_co_hosts').update({
      status: action === 'decline' ? 'declined' : 'accepted',
      user_id: user.id,
    }).eq('id', invite.id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  } catch (error) {
    console.error('acceptCoHost error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
