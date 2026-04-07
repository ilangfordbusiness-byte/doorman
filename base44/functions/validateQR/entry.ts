import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { qr_data, action } = await req.json();
    
    if (!qr_data) {
      return Response.json({ valid: false, error: 'No QR data provided' });
    }

    // Decode QR payload
    let payload;
    try {
      payload = JSON.parse(atob(qr_data));
    } catch {
      return Response.json({ valid: false, error: 'Invalid QR code format' });
    }

    const { eid, gid, sec, ts, n } = payload;

    if (!eid || !gid || !sec || !ts) {
      return Response.json({ valid: false, error: 'Incomplete QR data' });
    }

    // Check timestamp - QR valid for 15 seconds
    const age = Date.now() - ts;
    if (age > 15000 || age < -5000) {
      return Response.json({ valid: false, error: 'QR code expired. Ask guest to refresh their pass.' });
    }

    // Fetch the guestlist entry
    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ id: gid });
    if (!entries.length) {
      return Response.json({ valid: false, error: 'Guest not found' });
    }

    const entry = entries[0];

    // Validate secret matches
    if (entry.qr_secret !== sec) {
      return Response.json({ valid: false, error: 'Invalid QR code. Possible forgery.' });
    }

    // Validate event matches
    if (entry.event_id !== eid) {
      return Response.json({ valid: false, error: 'QR code is for a different event' });
    }

    // Fetch event details
    const events = await base44.asServiceRole.entities.Event.filter({ id: eid });
    const event = events[0];

    // Check if already checked in
    if (entry.status === 'checked_in') {
      return Response.json({
        valid: false,
        error: 'Already checked in',
        guest_name: entry.guest_name,
        event_name: event?.title,
        status: 'checked_in',
        checked_in_at: entry.checked_in_at,
      });
    }

    // Check if approved/invited
    if (!['approved', 'invited'].includes(entry.status)) {
      return Response.json({
        valid: false,
        error: `Guest status: ${entry.status}`,
        guest_name: entry.guest_name,
        event_name: event?.title,
        status: entry.status,
      });
    }

    // If action is check_in, mark the guest
    if (action === 'check_in') {
      await base44.asServiceRole.entities.GuestlistEntry.update(gid, {
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
        checked_in_by: user.email,
        // Rotate the QR secret so old codes can't be reused
        qr_secret: crypto.randomUUID(),
      });

      return Response.json({
        valid: true,
        checked_in: true,
        guest_name: entry.guest_name,
        event_name: event?.title,
        plus_one: entry.plus_one,
        plus_one_name: entry.plus_one_name,
      });
    }

    // Just validate, don't check in yet
    return Response.json({
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});