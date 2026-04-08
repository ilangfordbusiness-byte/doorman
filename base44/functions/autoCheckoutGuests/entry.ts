import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    // Find published events from today or earlier that have an end_time in the past
    const events = await base44.asServiceRole.entities.Event.filter({ status: 'published' });

    const expiredEvents = events.filter((ev) => {
      if (!ev.end_time) return false;
      if (ev.date < todayDate) return true;
      if (ev.date === todayDate && ev.end_time <= currentTime) return true;
      return false;
    });

    if (expiredEvents.length === 0) {
      return Response.json({ message: 'No expired events', checked_out: 0 });
    }

    let checkedOut = 0;

    for (const event of expiredEvents) {
      // Find guests still checked in without a checkout time
      const guests = await base44.asServiceRole.entities.GuestlistEntry.filter({
        event_id: event.id,
        status: 'checked_in',
      });

      const stillInside = guests.filter((g) => !g.checked_out_at);

      for (const guest of stillInside) {
        // Use end_time as the checkout time for accurate hours-partied calc
        const checkoutTime = new Date(`${event.date}T${event.end_time}:00`).toISOString();
        await base44.asServiceRole.entities.GuestlistEntry.update(guest.id, {
          checked_out_at: checkoutTime,
        });
        checkedOut++;
      }
    }

    return Response.json({
      message: `Auto-checkout complete`,
      events_processed: expiredEvents.length,
      checked_out: checkedOut,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});