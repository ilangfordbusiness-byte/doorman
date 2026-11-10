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
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, getVerifiedCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { eventZone, zonedToUtc } from '../_shared/eventTime.ts';
import { base64ToBytes, buildPkpass, type PassSigningConfig, passSigningConfigFromEnv } from '../_shared/pkpass.ts';
import { buildQrPayload, sigEqual } from '../_shared/tickets.ts';
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

// verify_jwt=false (supabase/config.toml), because the web flow ends in a plain
// browser navigation that carries no Authorization header:
//   POST {entry_id}               user JWT, verified here (getVerifiedCaller).
//                                 Answers with the .pkpass bytes (the iOS app).
//   POST {entry_id, mode:"link"}  same checks; answers {url, query, expires_at}:
//                                 a signed GET link valid for LINK_TTL_S.
//   GET ?entry_id&exp&sig         no session; the HMAC is the authentication.
//                                 Answers with the .pkpass bytes, so Safari shows
//                                 the "Add to Apple Wallet" sheet. iOS Safari does
//                                 not open a pass from a blob: URL, so the web
//                                 must navigate to a real HTTPS URL.
// The link holds only the ticket id and an expiry: no JWT, no personal data.
const LINK_TTL_S = 300;

// Keyed by WALLET_LINK_SECRET, falling back to the AUTOMATION_SECRET every
// deployment already has. The "walletpass:" prefix keeps these signatures apart
// from any other HMAC made with the same key.
function linkSecret(): string {
  return Deno.env.get('WALLET_LINK_SECRET') || Deno.env.get('AUTOMATION_SECRET') || '';
}

async function linkSig(entryId: string, exp: number): Promise<string> {
  const secret = linkSecret();
  if (!secret) throw new Error('WALLET_LINK_SECRET / AUTOMATION_SECRET not set');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`walletpass:${entryId}:${exp}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// deno-lint-ignore no-explicit-any
type Row = any;
type Loaded = { entry: Row; event: Row } | { error: string; status: number; code?: string };

// The ticket and its event, if a pass may be issued for them now. Shared by the
// POST and GET paths, so a link can never issue what a POST would refuse.
async function loadIssuable(svc: SupabaseClient, entryId: string): Promise<Loaded> {
  const { data: entry } = await svc.from('guestlist_entries')
    .select('id, event_id, guest_user_id, guest_email, guest_name, status, qr_secret')
    .eq('id', entryId).maybeSingle();
  if (!entry) return { error: 'Ticket not found', status: 404 };
  // Same usable states the pass page shows a QR for.
  if (!['approved', 'invited'].includes(entry.status)) {
    return { error: 'This ticket is not active.', status: 400 };
  }
  const { data: event } = await svc.from('events')
    .select('id, title, date, start_time, end_time, timezone, status, live_qr, host_id, business_id, '
      + 'is_paid, hide_location_until_approved, venue_name, address, venue_lat, venue_lng')
    .eq('id', entry.event_id).maybeSingle();
  if (!event) return { error: 'Event not found', status: 404 };
  if (event.status === 'cancelled') return { error: 'This event was cancelled.', status: 400 };
  if (event.live_qr) {
    return {
      error: 'This event uses live passes, which refresh every few seconds. Open your pass in DoorMan at the door.',
      status: 400,
      code: 'live_qr',
    };
  }
  return { entry, event };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();

    if (req.method === 'GET') {
      const params = new URL(req.url).searchParams;
      const entryId = params.get('entry_id') || '';
      const exp = Number(params.get('exp'));
      const sig = params.get('sig') || '';
      if (!UUID_RE.test(entryId) || !Number.isInteger(exp) || !sig) return text('Invalid link.', 403);
      if (!sigEqual(sig, await linkSig(entryId, exp))) return text('Invalid link.', 403);
      if (exp < Math.floor(Date.now() / 1000)) return text('This link has expired. Go back and try again.', 403);
      const loaded = await loadIssuable(svc, entryId);
      if ('error' in loaded) return text(loaded.error, loaded.status === 404 ? 404 : 403);
      const cfg = passSigningConfigFromEnv();
      if (!cfg) return text('Apple Wallet passes are not set up yet.', 503);
      return await passResponse(svc, loaded.entry, loaded.event, cfg);
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const user = await getVerifiedCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { entry_id, mode } = await req.json().catch(() => ({}));
    if (!entry_id) return json({ error: 'Missing ticket id' }, 400);
    if (!UUID_RE.test(String(entry_id))) return json({ error: 'Ticket not found' }, 404);

    // Ownership first, so a non-owner learns nothing about the ticket's state.
    const { data: owner } = await svc.from('guestlist_entries')
      .select('guest_user_id, guest_email').eq('id', entry_id).maybeSingle();
    if (!owner) return json({ error: 'Ticket not found' }, 404);
    // Only the ticket's owner can get its pass.
    if (owner.guest_user_id !== user.id && owner.guest_email !== user.email) {
      return json({ error: "You don't own this ticket." }, 403);
    }

    const loaded = await loadIssuable(svc, entry_id);
    if ('error' in loaded) {
      return json({ error: loaded.error, ...(loaded.code ? { code: loaded.code } : {}) }, loaded.status);
    }

    const cfg = passSigningConfigFromEnv();
    if (!cfg) return json({ error: 'Apple Wallet passes are not set up yet.', code: 'not_configured' }, 503);

    if (mode === 'link') {
      const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
      const query = new URLSearchParams({
        entry_id: String(entry_id), exp: String(exp), sig: await linkSig(String(entry_id), exp),
      }).toString();
      // The web client builds the link from its own Supabase URL plus `query`:
      // inside the local stack SUPABASE_URL is an internal Docker host name.
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/walletPass?${query}`;
      return json({ url, query, expires_at: exp });
    }

    return await passResponse(svc, loaded.entry, loaded.event, cfg, user);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('walletPass error', msg);
    return json({ error: msg }, 500);
  }
});

async function passResponse(
  svc: SupabaseClient, entry: Row, event: Row, cfg: PassSigningConfig, user?: Row,
): Promise<Response> {
  // The same code the ticket email carries (validateQR decodes it and compares
  // qr_secret), so a transfer (new qr_secret) voids this pass at the door.
  const payload = buildQrPayload(entry);
  // The can_see_event_location gate, for the ticket's own guest: a hidden
  // venue shows only once the entry is approved (paid events always show).
  const showLocation = !event.hide_location_until_approved || event.is_paid
    || ['approved', 'checked_in'].includes(entry.status);
  const loc = showLocation ? event : null;

  // Guest label: the entry's name, else the guest's profile name, else email.
  let guestLabel: string = entry.guest_name || user?.full_name || '';
  if (!guestLabel && entry.guest_user_id) {
    const { data: guest } = await svc.from('profiles')
      .select('full_name').eq('id', entry.guest_user_id).maybeSingle();
    guestLabel = guest?.full_name || '';
  }
  if (!guestLabel) guestLabel = user?.email || entry.guest_email || '';

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
    { key: 'guest', label: 'GUEST', value: guestLabel },
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
}
