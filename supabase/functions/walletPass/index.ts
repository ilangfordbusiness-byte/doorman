// Builds a signed Apple Wallet pass (.pkpass) for the caller's own ticket.
//
// Phase 1: the pass is a snapshot. There is no PassKit web service, so the pass
// never updates (no webServiceURL / authenticationToken). That is safe because
// the door is the source of truth: a transfer rotates qr_secret
// (acceptTicketTransfer) and a revoke/refund changes the entry status, so
// validateQR rejects the old code even while it sits in Wallet.
//
// Live-QR events get no pass: their code rotates every few seconds and the door
// rejects the static code, so a static Wallet barcode could never get in.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { eventZone, zonedToUtc } from '../_shared/eventTime.ts';
import { base64ToBytes, buildPkpass, passSigningConfigFromEnv } from '../_shared/pkpass.ts';
import { PASS_IMAGES } from './assets.ts';

// DoorMan brand: email background #0a0a12, primary hsl(270 90% 65%).
const BG = 'rgb(10, 10, 18)';
const FG = 'rgb(255, 255, 255)';
const LABEL = 'rgb(166, 85, 246)';

const hhmm = (t: unknown, fallback: string) =>
  typeof t === 'string' && t ? t.slice(0, 5) : fallback;

// "2026-12-01T21:00:00+01:00": the event's wall-clock time with its own UTC
// offset, so Wallet (with ignoresTimeZone) shows the time as the host set it.
function localIso(date: string, time: string, tz: string): string {
  const instant = zonedToUtc(date, time, tz);
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const offsetMin = Math.round((Date.UTC(y, m - 1, d, h, mi) - instant.getTime()) / 60_000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { entry_id } = await req.json().catch(() => ({}));
    if (!entry_id) return json({ error: 'Missing ticket id' }, 400);

    const { data: entry } = await svc.from('guestlist_entries')
      .select('id, event_id, guest_user_id, guest_email, guest_name, status')
      .eq('id', entry_id).maybeSingle();
    if (!entry) return json({ error: 'Ticket not found' }, 404);
    // Only the ticket's owner can get its pass.
    if (entry.guest_user_id !== user.id && entry.guest_email !== user.email) {
      return json({ error: "You don't own this ticket." }, 403);
    }
    // Same usable states the pass page shows a QR for.
    if (!['approved', 'invited'].includes(entry.status)) {
      return json({ error: 'This ticket is not active.' }, 400);
    }

    const { data: event } = await svc.from('events')
      .select('id, title, date, start_time, end_time, timezone, status, live_qr, host_id, business_id')
      .eq('id', entry.event_id).maybeSingle();
    if (!event) return json({ error: 'Event not found' }, 404);
    if (event.status === 'cancelled') return json({ error: 'This event was cancelled.' }, 400);
    if (event.live_qr) {
      return json({
        error: 'This event uses live passes, which refresh every few seconds. Open your pass in DoorMan at the door.',
        code: 'live_qr',
      }, 400);
    }

    const cfg = passSigningConfigFromEnv();
    if (!cfg) return json({ error: 'Apple Wallet passes are not set up yet.', code: 'not_configured' }, 503);

    // Caller-scoped client: the QR payload and the venue come from the same
    // validating RPCs the pass page uses, so the barcode is byte-for-byte the
    // page's code and the location follows hide_location_until_approved.
    const asCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      },
    );
    const { data: payload, error: qrErr } = await asCaller.rpc('my_qr_payload', { p_entry_id: entry.id });
    if (qrErr || !payload) return json({ error: qrErr?.message || 'Ticket not found' }, 404);
    const { data: locRows } = await asCaller.rpc('get_events_location', { p_event_ids: [event.id] });
    const loc = Array.isArray(locRows) ? locRows[0] : null;

    // Host label: business name for business events, else the host's name.
    let hostName = '';
    if (event.business_id) {
      const { data: biz } = await svc.from('business_accounts')
        .select('business_name').eq('id', event.business_id).maybeSingle();
      hostName = biz?.business_name || '';
    }
    if (!hostName) {
      const { data: host } = await svc.from('profiles')
        .select('full_name').eq('id', event.host_id).maybeSingle();
      hostName = host?.full_name || '';
    }

    const { data: order } = await svc.from('ticket_orders')
      .select('ticket_tiers(name)').eq('guestlist_entry_id', entry.id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const tierName: string | null = (order as any)?.ticket_tiers?.name ?? null;

    const tz = eventZone(event);
    const start = hhmm(event.start_time, '00:00');
    const startIso = localIso(event.date, start, tz);
    const startUtc = zonedToUtc(event.date, start, tz);
    // Expire after the event: end time (next day when it is past midnight),
    // or end of the start day, plus a few hours of grace.
    const endTime = hhmm(event.end_time, '');
    let endUtc: Date;
    if (endTime && endTime > start) endUtc = zonedToUtc(event.date, endTime, tz);
    else if (endTime) endUtc = new Date(zonedToUtc(event.date, endTime, tz).getTime() + 86_400_000);
    else endUtc = zonedToUtc(event.date, '23:59', tz);
    const expires = new Date(endUtc.getTime() + 6 * 3_600_000);

    const venueName: string = loc?.venue_name || '';
    const address: string = loc?.address || '';

    const auxiliaryFields = [
      { key: 'guest', label: 'GUEST', value: entry.guest_name || user.full_name || user.email },
      ...(tierName ? [{ key: 'tier', label: 'TICKET', value: tierName }] : []),
    ];
    const backFields = [
      ...(hostName ? [{ key: 'host', label: 'Hosted by', value: hostName }] : []),
      ...(venueName || address
        ? [{ key: 'address', label: 'Venue', value: [venueName, address].filter(Boolean).join('\n') }]
        : [{ key: 'address', label: 'Venue', value: 'Shown in DoorMan once your spot is confirmed.' }]),
      {
        key: 'entry', label: 'Entry',
        value: 'Single-use code. Valid until first scan. If you transfer this ticket, this pass stops working.',
      },
    ];

    const passJson: Record<string, unknown> = {
      formatVersion: 1,
      serialNumber: entry.id,
      organizationName: 'DoorMan',
      description: `DoorMan ticket: ${event.title}`,
      logoText: 'DoorMan',
      foregroundColor: FG,
      backgroundColor: BG,
      labelColor: LABEL,
      relevantDate: startUtc.toISOString(),
      expirationDate: expires.toISOString(),
      sharingProhibited: true,
      barcodes: [{
        format: 'PKBarcodeFormatQR',
        message: payload,
        messageEncoding: 'iso-8859-1',
      }],
      eventTicket: {
        primaryFields: [{ key: 'event', label: 'EVENT', value: event.title }],
        secondaryFields: [
          {
            key: 'date', label: 'DATE', value: startIso,
            dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleNone', ignoresTimeZone: true,
          },
          {
            key: 'time', label: 'DOORS', value: startIso,
            dateStyle: 'PKDateStyleNone', timeStyle: 'PKDateStyleShort', ignoresTimeZone: true,
          },
          ...(venueName ? [{ key: 'venue', label: 'VENUE', value: venueName }] : []),
        ],
        auxiliaryFields,
        backFields,
      },
    };
    if (loc?.venue_lat != null && loc?.venue_lng != null) {
      passJson.locations = [{
        latitude: Number(loc.venue_lat),
        longitude: Number(loc.venue_lng),
        relevantText: `${event.title}: your pass is ready`,
      }];
    }

    const files: Record<string, Uint8Array> = {};
    for (const [name, b64] of Object.entries(PASS_IMAGES)) files[name] = base64ToBytes(b64);

    const pkpass = await buildPkpass(passJson, files, cfg);
    const slug = String(event.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ticket';
    return new Response(pkpass, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="doorman-${slug}.pkpass"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('walletPass error', msg);
    return json({ error: msg }, 500);
  }
});
