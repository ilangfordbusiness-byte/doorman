import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { event_id, action } = body;
    if (!event_id) return Response.json({ error: 'Missing event_id' }, { status: 400 });

    const srv = base44.asServiceRole;
    const events = await srv.entities.Event.filter({ id: event_id });
    if (!events.length) return Response.json({ error: 'Event not found' }, { status: 404 });
    const evt = events[0];

    const coHosts = Array.isArray(evt.co_hosts) ? [...evt.co_hosts] : [];
    const idx = coHosts.findIndex((c) => c && c.email === user.email);
    if (idx === -1) return Response.json({ error: 'You are not invited as a co-host of this event' }, { status: 403 });
    if (coHosts[idx].status === 'accepted') return Response.json({ ok: true, already: true });

    if (action === 'decline') {
      coHosts[idx] = { ...coHosts[idx], status: 'declined' };
      await srv.entities.Event.update(event_id, { co_hosts: coHosts });
      return Response.json({ ok: true });
    }

    coHosts[idx] = {
      ...coHosts[idx],
      status: 'accepted',
      name: user.full_name || coHosts[idx].name || user.email,
      picture: user.profile_picture || '',
    };

    const coHostEmails = Array.isArray(evt.co_host_emails) ? evt.co_host_emails.filter((e) => e !== user.email) : [];
    coHostEmails.push(user.email);

    await srv.entities.Event.update(event_id, { co_hosts: coHosts, co_host_emails: coHostEmails });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('acceptCoHost error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}