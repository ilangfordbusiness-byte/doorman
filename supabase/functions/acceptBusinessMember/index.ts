// Accept or decline an invite to co-manage a business account. Mirrors
// acceptCoHost: finds the caller's pending business_members row (by user_id or
// email), sets it accepted/declined and links their user_id.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const { business_id, action } = body;
    if (!business_id) return json({ error: 'Missing business_id' }, 400);

    const { data: invite } = await svc.from('business_members').select('*')
      .eq('business_id', business_id)
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();
    if (!invite) {
      return json({ error: 'You have not been invited to this business account' }, 403);
    }
    if (invite.status === 'accepted') return json({ ok: true, already: true });

    const { error } = await svc.from('business_members').update({
      status: action === 'decline' ? 'declined' : 'accepted',
      user_id: user.id,
    }).eq('id', invite.id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  } catch (error) {
    console.error('acceptBusinessMember error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
