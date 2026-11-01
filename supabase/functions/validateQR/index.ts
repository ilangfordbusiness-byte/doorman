// Doorman scanner: validates a QR payload and (on action=check_in) atomically
// checks the guest in. Only the host, accepted co-hosts, or registered staff
// of that event may scan. QR wire format is unchanged from the original app.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { eventZone } from '../_shared/eventTime.ts';
import { LIVE_QR_TOL, LIVE_QR_VERSION, liveQrSig, liveQrWindow, sigEqual } from '../_shared/tickets.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { qr_data, guestlist_entry_id, action } = await req.json();

    // Two ways in: a scanned QR payload, or a bare guestlist entry id chosen from
    // an authorized manager/staff door list (name-based check-in). The entry-id
    // path skips the qr_secret/forgery check — the caller is authorized below and
    // can't read qr_secret anyway — but is otherwise identical.
    let entry, eid, gid;
    // Whether this scan carried a current rotating (live) code. Used below to
    // reject the old static code on events that opted into live passes.
    let liveCode = false;
    if (guestlist_entry_id) {
      const { data: e } = await svc.from('guestlist_entries').select('*').eq('id', guestlist_entry_id).maybeSingle();
      if (!e) return json({ valid: false, error: 'Guest not found' });
      entry = e;
      gid = e.id;
      eid = e.event_id;
    } else {
      if (!qr_data) return json({ valid: false, error: 'No QR data provided' });
      let payload;
      try {
        payload = JSON.parse(atob(qr_data));
      } catch {
        return json({ valid: false, error: 'Invalid QR code format' });
      }
      ({ eid, gid } = payload);
      if (!eid || !gid) return json({ valid: false, error: 'Incomplete QR data' });

      const { data: e } = await svc.from('guestlist_entries').select('*').eq('id', gid).maybeSingle();
      if (!e) return json({ valid: false, error: 'Guest not found' });
      if (e.event_id !== eid) {
        return json({ valid: false, error: 'QR code is for a different event' });
      }

      if (payload.v === LIVE_QR_VERSION) {
        // Rotating live code: the window must be current (bounds how long a
        // screenshot stays valid and absorbs clock skew), and the HMAC must
        // verify against the entry's server-only qr_secret.
        const { c, sig } = payload;
        if (typeof c !== 'number' || typeof sig !== 'string') {
          return json({ valid: false, error: 'Incomplete QR data' });
        }
        if (Math.abs(c - liveQrWindow()) > LIVE_QR_TOL) {
          return json({ valid: false, expired: true, error: 'This pass has expired — ask the guest to refresh their code.' });
        }
        const expected = await liveQrSig(e.qr_secret, eid, gid, c);
        if (!sigEqual(expected, sig)) {
          return json({ valid: false, error: 'Invalid QR code. Possible forgery.' });
        }
        liveCode = true;
      } else {
        // Static single-use code.
        if (!payload.sec) return json({ valid: false, error: 'Incomplete QR data' });
        if (e.qr_secret !== payload.sec) {
          return json({ valid: false, error: 'Invalid QR code. Possible forgery.' });
        }
      }
      entry = e;
    }

    const { data: event } = await svc.from('events').select('*').eq('id', eid).single();

    // A live-QR event rejects the static code: otherwise a guest could screenshot
    // their static pass and pass it on, which is exactly what live passes prevent.
    // (The name-based staff check-in path, guestlist_entry_id, is unaffected.)
    if (event?.live_qr && !guestlist_entry_id && !liveCode) {
      return json({ valid: false, error: 'This event uses live passes — open the pass in the app for a fresh code.' });
    }

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
    // Business-account events: the owner and accepted co-managers run the door too.
    if (!isStaff && event?.business_id) {
      const { data: biz } = await svc.from('business_accounts')
        .select('owner_id').eq('id', event.business_id).maybeSingle();
      isStaff = biz?.owner_id === user.id;
      if (!isStaff) {
        const { count: member } = await svc.from('business_members')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', event.business_id).eq('status', 'accepted')
          .or(`user_id.eq.${user.id},email.eq.${user.email}`);
        isStaff = (member ?? 0) > 0;
      }
    }
    if (!isStaff) return json({ valid: false, error: 'Not authorized for this event' }, 403);

    // Undo a check-in (door mis-tap). Guarded so it only reverts a checked-in row.
    if (action === 'uncheck') {
      const { data: reverted } = await svc.from('guestlist_entries').update({
        status: 'approved', checked_in_at: null, checked_in_by: null,
      }).eq('id', gid).eq('status', 'checked_in').select('id');
      if (!reverted?.length) {
        return json({ valid: false, error: 'Guest is not checked in' });
      }
      return json({ valid: true, checked_in: false, unchecked: true, guest_name: entry.guest_name, event_name: event?.title });
    }

    // Single-use: already-scanned tickets can't be reused.
    if (entry.status === 'checked_in') {
      const scannedAt = entry.checked_in_at
        ? new Date(entry.checked_in_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: eventZone(event) })
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

    // A plus-one only counts if the host enabled plus-ones for this event, so
    // a guest cannot make the door admit an extra person by flagging their own
    // entry. (The trigger also blocks guests writing the field at all.)
    const showPlusOne = !!(entry.plus_one && event?.plus_one_allowed);

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
        // Only surface a plus-one the host actually allowed for this event.
        plus_one: showPlusOne,
        plus_one_name: showPlusOne ? entry.plus_one_name : null,
      });
    }

    return json({
      valid: true,
      checked_in: false,
      guest_name: entry.guest_name,
      guest_email: entry.guest_email,
      event_name: event?.title,
      status: entry.status,
      plus_one: showPlusOne,
      plus_one_name: showPlusOne ? entry.plus_one_name : null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
