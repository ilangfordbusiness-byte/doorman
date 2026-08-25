// Doorman scanner: validates a QR payload and (on action=check_in) atomically
// checks the guest in. Only the host, accepted co-hosts, or registered staff
// of that event may scan. QR wire format is unchanged from Base44.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { qr_data, action } = await req.json();
    if (!qr_data) return json({ valid: false, error: 'No QR data provided' });

    let payload;
    try {
      payload = JSON.parse(atob(qr_data));
    } catch {
      return json({ valid: false, error: 'Invalid QR code format' });
    }
    const { eid, gid, sec } = payload;
    if (!eid || !gid || !sec) return json({ valid: false, error: 'Incomplete QR data' });

    const { data: entry } = await svc.from('guestlist_entries').select('*').eq('id', gid).maybeSingle();
    if (!entry) return json({ valid: false, error: 'Guest not found' });

    if (entry.qr_secret !== sec) {
      return json({ valid: false, error: 'Invalid QR code. Possible forgery.' });
    }
    if (entry.event_id !== eid) {
      return json({ valid: false, error: 'QR code is for a different event' });
    }

    const { data: event } = await svc.from('events').select('*').eq('id', eid).single();

    // Authorization: host, accepted co-host, or registered staff.
    let isStaff = !!event && event.host_id === user.id;
    if (!isStaff) {
      const { count: coHost } = await svc.from('event_co_hosts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eid).eq('status', 'accepted')
        .or(`user_id.eq.${user.id},email.eq.${user.email}`);
      isStaff = (coHost ?? 0) > 0;
    }
    if (!isStaff) {
      const { count: staff } = await svc.from('event_staff')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eid)
        .or(`user_id.eq.${user.id},email.eq.${user.email}`);
      isStaff = (staff ?? 0) > 0;
    }
    if (!isStaff) return json({ valid: false, error: 'Not authorized for this event' }, 403);

    // Single-use: already-scanned tickets can't be reused.
    if (entry.status === 'checked_in') {
      const scannedAt = entry.checked_in_at
        ? new Date(entry.checked_in_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
        : 'previously';
      return json({
        valid: false,
        already_used: true,
        error: 'This ticket has already been used',
        message: `Already checked in at ${scannedAt}`,
        guest_name: entry.guest_name,
        event_name: event?.title,
        status: 'checked_in',
        checked_in_at: entry.checked_in_at,
        checked_in_at_display: scannedAt,
      });
    }

    if (!['approved', 'invited'].includes(entry.status)) {
      return json({
        valid: false,
        error: `Guest status: ${entry.status}`,
        guest_name: entry.guest_name,
        event_name: event?.title,
        status: entry.status,
      });
    }

    if (action === 'check_in') {
      // Atomic: only flips if the status is still valid (double-scan race safe).
      const { data: updated } = await svc.from('guestlist_entries').update({
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
        checked_in_by: user.id,
      }).eq('id', gid).in('status', ['approved', 'invited']).select('id');
      if (!updated?.length) {
        return json({ valid: false, already_used: true, error: 'This ticket has already been used' });
      }
      return json({
        valid: true,
        checked_in: true,
        guest_name: entry.guest_name,
        event_name: event?.title,
        plus_one: entry.plus_one,
        plus_one_name: entry.plus_one_name,
      });
    }

    return json({
      valid: true,
      checked_in: false,
      guest_name: entry.guest_name,
      guest_email: entry.guest_email,
      event_name: event?.title,
      status: entry.status,
      plus_one: entry.plus_one,
      plus_one_name: entry.plus_one_name,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
