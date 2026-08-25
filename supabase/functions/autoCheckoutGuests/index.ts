// Auto-checks-out guests after an event ends, leaving the last 5 inside.
// Triggered by pg_cron; guarded by AUTOMATION_SECRET. verify_jwt=false.
// (Base44 version was admin-invoked; the logic is identical.)
import { hasAutomationSecret, json, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  try {
    if (!hasAutomationSecret(req)) return json({ error: 'Unauthorized' }, 401);
    const svc = serviceClient();

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const timeToMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const { data: events } = await svc.from('events').select('*')
      .eq('status', 'published')
      .not('end_time', 'is', null)
      .lte('date', todayDate);

    const activeEvents = (events ?? []).filter((ev) => {
      if (!ev.end_time || !ev.start_time) return false;
      if (ev.date < todayDate) return true;
      const startMin = timeToMinutes(String(ev.start_time));
      const endMin = timeToMinutes(String(ev.end_time));
      return currentMinutes >= startMin - 30 && currentMinutes >= endMin;
    });
    if (!activeEvents.length) {
      return json({ message: 'No events in active window', checked_out: 0 });
    }

    let checkedOut = 0;
    for (const event of activeEvents) {
      const { data: inside } = await svc.from('guestlist_entries')
        .select('id')
        .eq('event_id', event.id)
        .eq('status', 'checked_in')
        .is('checked_out_at', null)
        .order('checked_in_at', { ascending: true });
      if (!inside || inside.length <= 5) continue; // let the last few stay

      const checkoutTime = new Date(
        `${event.date}T${String(event.end_time).slice(0, 5)}:00Z`,
      ).toISOString();
      const toCheckOut = inside.slice(0, inside.length - 5).map((g) => g.id);
      const { error } = await svc.from('guestlist_entries')
        .update({ checked_out_at: checkoutTime })
        .in('id', toCheckOut);
      if (!error) checkedOut += toCheckOut.length;
    }

    return json({
      message: 'Auto-checkout complete',
      events_processed: activeEvents.length,
      checked_out: checkedOut,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
