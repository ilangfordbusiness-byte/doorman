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
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    function timeToMinutes(t) {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    }

    // Get all published events
    const events = await base44.asServiceRole.entities.Event.filter({ status: 'published' });

    // Only process events that:
    // - Are today or earlier
    // - Have started (start_time <= now) OR are within 30 min before start (warm-up window)
    // - Have an end_time that has passed
    const activeEvents = events.filter((ev) => {
      if (!ev.end_time || !ev.start_time) return false;

      const startMin = timeToMinutes(ev.start_time);
      const endMin = timeToMinutes(ev.end_time);

      if (ev.date < todayDate) return true; // past day, definitely eligible

      if (ev.date === todayDate) {
        // Within window: 30 min before start to end of event
        return currentMinutes >= startMin - 30 && currentMinutes >= endMin;
      }

      return false;
    });

    if (activeEvents.length === 0) {
      return Response.json({ message: 'No events in active window', checked_out: 0 });
    }

    let checkedOut = 0;

    for (const event of activeEvents) {
      const guests = await base44.asServiceRole.entities.GuestlistEntry.filter({
        event_id: event.id,
        status: 'checked_in',
      });

      const stillInside = guests.filter((g) => !g.checked_out_at);

      // Stop auto-checkout when 5 or fewer guests remain — let the last few stay
      if (stillInside.length <= 5) continue;

      const checkoutTime = new Date(`${event.date}T${event.end_time}:00`).toISOString();

      // Check out everyone except the last 5
      const toCheckOut = stillInside.slice(0, stillInside.length - 5);

      for (const guest of toCheckOut) {
        await base44.asServiceRole.entities.GuestlistEntry.update(guest.id, {
          checked_out_at: checkoutTime,
        });
        checkedOut++;
      }
    }

    return Response.json({
      message: 'Auto-checkout complete',
      events_processed: activeEvents.length,
      checked_out: checkedOut,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});