import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns the Guest hub payload (invites + ticket transfers) in a single
// response, resolving all referenced events in one batched query so the
// client avoids an N+1 waterfall (one Event.filter per invite).
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const me = { email: user.email, phone: user.phone };

    const [byEmail, byPhone, incoming, outgoing] = await Promise.all([
      base44.asServiceRole.entities.GuestlistEntry.filter({ guest_email: me.email }, '-created_date'),
      me.phone
        ? base44.asServiceRole.entities.GuestlistEntry.filter({ guest_phone: me.phone }, '-created_date')
        : Promise.resolve([]),
      base44.asServiceRole.entities.TicketTransfer.filter({ recipient_email: me.email, status: 'pending' }, '-created_date'),
      base44.asServiceRole.entities.TicketTransfer.filter({ sender_email: me.email, status: 'pending' }, '-created_date'),
    ]);

    const seen = new Set();
    const entries = [...byEmail, ...byPhone].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    let inviteEvents = [];
    if (entries.length) {
      const eventIds = [...new Set(entries.map((g) => g.event_id).filter(Boolean))];
      const events = eventIds.length
        ? await base44.asServiceRole.entities.Event.filter({ id: { $in: eventIds } })
        : [];
      const byId = new Map(events.map((e) => [e.id, e]));
      inviteEvents = eventIds
        .map((eid) => {
          const ev = byId.get(eid);
          if (!ev) return null;
          const entry = entries.find((g) => g.event_id === eid);
          return { ...ev, guestStatus: entry?.status, entryId: entry?.id };
        })
        .filter(Boolean);
    }

    return Response.json({ inviteEvents, transfers: { incoming, outgoing } });
  } catch (error) {
    console.log('getGuestDashboard error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}