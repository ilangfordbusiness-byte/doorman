// Meta Conversions API (server-side ad attribution) for business accounts
// that run their own Meta ads. Sends a Purchase event to the business's pixel
// using the business's own access token, with hashed buyer details plus the
// browser match keys captured at checkout (ticket_order_tracking). Best
// effort: callers log and move on; a Meta outage never affects fulfilment.
//
// Dedup: event_id = the order id. The browser pixel fires Purchase with the
// same eventID on the confirmation screen, and Meta keeps one of the pair.
// deno-lint-ignore-file no-explicit-any

const GRAPH_VERSION = 'v23.0';

export interface MetaConfig {
  pixelId: string;
  accessToken: string;
  testEventCode: string | null;
}

// Resolve the Meta config for an event: its business's pixel + token, or null
// when the event is personal or the business has not set both up.
export async function metaConfigForEvent(svc: any, event: any): Promise<MetaConfig | null> {
  if (!event?.business_id) return null;
  const { data: b } = await svc.from('business_accounts')
    .select('meta_pixel_id, meta_capi_token, meta_test_event_code')
    .eq('id', event.business_id).maybeSingle();
  if (!b?.meta_pixel_id || !b?.meta_capi_token) return null;
  return {
    pixelId: String(b.meta_pixel_id),
    accessToken: String(b.meta_capi_token),
    testEventCode: b.meta_test_event_code ? String(b.meta_test_event_code) : null,
  };
}

// Meta requires SHA-256 of the normalised value (lowercase, trimmed; phones
// as digits only). Missing values are simply omitted from user_data.
export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hashed(value: string | null | undefined, normalise: (s: string) => string) {
  const v = value == null ? '' : normalise(String(value));
  return v ? [await sha256Hex(v)] : undefined;
}
const lower = (s: string) => s.trim().toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '');

export interface PurchaseInput {
  order: any;                 // ticket_orders row
  event: any;                 // events row
  tracking?: any | null;      // ticket_order_tracking row (may be null)
  buyerPhone?: string | null; // profiles.phone (E.164) if known
}

export function buildPurchaseEvent(input: PurchaseInput) {
  const { order, event, tracking } = input;
  const name = String(order.guest_name || '').replace(/\s*\(\d+ of \d+\)$/, '').trim();
  const [first, ...rest] = name.split(/\s+/);
  const origin = Deno.env.get('APP_ORIGIN') || 'https://thedoorman.app';
  return {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(order.id),
    action_source: 'website',
    event_source_url: tracking?.event_source_url || `${origin}/event/${event.id}`,
    user: {
      email: order.guest_email as string | null,
      first,
      last: rest.join(' '),
      externalId: order.guest_user_id as string | null,
      phone: input.buyerPhone ?? null,
      ip: tracking?.client_ip ?? null,
      ua: tracking?.client_user_agent ?? null,
      fbp: tracking?.fbp ?? null,
      fbc: tracking?.fbc ?? null,
    },
    custom_data: {
      value: Number(order.paid_minor) / 100,
      currency: String(order.currency || event.currency || 'gbp').toUpperCase(),
      content_type: 'product',
      content_ids: [String(order.tier_id)],
      content_name: String(event.title || ''),
      num_items: Number(order.quantity) || 1,
      order_id: String(order.id),
    },
  };
}

// Serialise into the Conversions API payload shape (hashing PII).
export async function toCapiPayload(ev: ReturnType<typeof buildPurchaseEvent>, testEventCode: string | null) {
  const u = ev.user;
  const user_data: Record<string, unknown> = {};
  const em = await hashed(u.email, lower); if (em) user_data.em = em;
  const fn = await hashed(u.first, lower); if (fn) user_data.fn = fn;
  const ln = await hashed(u.last, lower); if (ln) user_data.ln = ln;
  const ph = await hashed(u.phone, digits); if (ph) user_data.ph = ph;
  const ext = await hashed(u.externalId, (s) => s.trim()); if (ext) user_data.external_id = ext;
  if (u.ip) user_data.client_ip_address = u.ip;
  if (u.ua) user_data.client_user_agent = u.ua;
  if (u.fbp) user_data.fbp = u.fbp;
  if (u.fbc) user_data.fbc = u.fbc;
  const body: Record<string, unknown> = {
    data: [{
      event_name: ev.event_name,
      event_time: ev.event_time,
      event_id: ev.event_id,
      action_source: ev.action_source,
      event_source_url: ev.event_source_url,
      user_data,
      custom_data: ev.custom_data,
    }],
  };
  if (testEventCode) body.test_event_code = testEventCode;
  return body;
}

export interface MetaSendResult {
  ok: boolean;
  status: number;
  body: string;
}

// POST to the Graph API. META_GRAPH_BASE can point at a local stub in tests.
export async function postMetaEvents(cfg: MetaConfig, payload: unknown): Promise<MetaSendResult> {
  const base = Deno.env.get('META_GRAPH_BASE') || 'https://graph.facebook.com';
  const url = `${base}/${GRAPH_VERSION}/${encodeURIComponent(cfg.pixelId)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(payload as object), access_token: cfg.accessToken }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// Send the Purchase for a fulfilled order. Returns null when the event's
// business has no Meta setup. Never throws.
export async function sendMetaPurchase(svc: any, order: any, event: any): Promise<MetaSendResult | null> {
  try {
    const cfg = await metaConfigForEvent(svc, event);
    if (!cfg) return null;
    const [{ data: tracking }, { data: profile }] = await Promise.all([
      svc.from('ticket_order_tracking').select('*').eq('order_id', order.id).maybeSingle(),
      order.guest_user_id
        ? svc.from('profiles').select('phone').eq('id', order.guest_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const ev = buildPurchaseEvent({ order, event, tracking, buyerPhone: profile?.phone ?? null });
    const payload = await toCapiPayload(ev, cfg.testEventCode);
    const result = await postMetaEvents(cfg, payload);
    if (!result.ok) console.log('meta capi purchase rejected', result.status, result.body.slice(0, 300));
    else console.log('meta capi purchase sent', order.id);
    return result;
  } catch (e) {
    console.log('meta capi purchase error', e instanceof Error ? e.message : String(e));
    return { ok: false, status: 0, body: String(e) };
  }
}
