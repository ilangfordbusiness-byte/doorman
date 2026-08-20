import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns pending notification counts + co-host invite details for the current
// user in a single call so badges across the app share one fetch.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const email = user.email;

    const srv = base44.asServiceRole;
    const [events, friendReqs, entries] = await Promise.all([
      srv.entities.Event.filter({}),
      srv.entities.FriendRequest.filter({ receiver_email: email }),
      srv.entities.GuestlistEntry.filter({ guest_email: email }),
    ]);

    const coHostInvites = events
      .filter((ev) => Array.isArray(ev.co_hosts) && ev.co_hosts.some((c) => c && c.email === email && c.status === 'pending'))
      .map((ev) => ({
        event_id: ev.id,
        title: ev.title,
        date: ev.date,
        start_time: ev.start_time,
        host_name: ev.host_name,
        host_picture: ev.host_picture,
        cover_image: ev.cover_image,
      }));

    const friendRequests = friendReqs.filter((r) => r.status === 'pending').length;
    const eventInvites = entries.filter((e) => e.status === 'invited').length;

    return Response.json({
      coHostInvites,
      counts: { coHost: coHostInvites.length, friendRequests, eventInvites },
    });
  } catch (error) {
    console.log('getNotifications error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}