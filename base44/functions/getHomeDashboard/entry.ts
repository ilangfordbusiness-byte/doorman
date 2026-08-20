import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns the joined Home dashboard payload in a single response so the
// client avoids an N+1 waterfall (one call per attending event + per-call
// attendee/friend fetches). Everything is resolved server-side here.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const me = {
      email: user.email,
      phone: user.phone,
      full_name: user.full_name,
      instagram: user.instagram,
      profile_picture: user.profile_picture,
    };

    const [entries, hosted, sent, received] = await Promise.all([
      base44.asServiceRole.entities.GuestlistEntry.filter({ guest_email: me.email }),
      base44.asServiceRole.entities.Event.filter({ host_email: me.email }),
      base44.asServiceRole.entities.FriendRequest.filter({ sender_email: me.email }),
      base44.asServiceRole.entities.FriendRequest.filter({ receiver_email: me.email }),
    ]);

    const attendingIds = [...new Set(
      entries
        .filter((e) => ['approved', 'invited', 'checked_in'].includes(e.status))
        .map((e) => e.event_id)
        .filter(Boolean)
    )];

    let attendingEvents = [];
    if (attendingIds.length) {
      attendingEvents = await base44.asServiceRole.entities.Event.filter({ id: { $in: attendingIds } });
    }

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const seen = new Set();
    const upcoming = [...attendingEvents, ...hosted]
      .filter((ev) => {
        if (seen.has(ev.id)) return false;
        seen.add(ev.id);
        return ev.date >= today && ev.status !== 'cancelled';
      })
      .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

    let event = null;
    let isHosting = false;
    let friendsGoing = [];
    let attendeeCount = 0;

    if (upcoming.length > 0) {
      const ev = upcoming[0];
      event = ev;
      isHosting = hosted.some((h) => h.id === ev.id);

      const attendees = await base44.asServiceRole.entities.GuestlistEntry.filter({ event_id: ev.id });
      const going = new Set(
        attendees
          .filter((a) => ['approved', 'invited', 'checked_in'].includes(a.status))
          .map((a) => a.guest_email)
      );
      attendeeCount = going.size;

      const friends = [
        ...sent
          .filter((r) => r.status === 'accepted')
          .map((r) => ({ email: r.receiver_email, name: r.receiver_name, picture: r.receiver_picture })),
        ...received
          .filter((r) => r.status === 'accepted')
          .map((r) => ({ email: r.sender_email, name: r.sender_name, picture: r.sender_picture })),
      ];
      friendsGoing = friends.filter((f) => going.has(f.email));
    }

    return Response.json({ user: me, event, isHosting, friendsGoing, attendeeCount });
  } catch (error) {
    console.log('getHomeDashboard error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}