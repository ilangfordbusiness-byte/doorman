// Native push notifications over the APNs HTTP/2 provider API.
//
// Companion to email.ts: the same fan-outs (event updates, host chat,
// reminders, transfers) call notifyGuestsPush() after their email loop. Like
// sendEmail, nothing here throws to the caller and the whole module is a
// logged no-op until the APNS_* secrets are set.
//
// Auth is a provider token: an ES256 JWT signed with the team's APNs auth key
// (.p8), cached for ~50 minutes (Apple wants it refreshed at least hourly and
// not more often than every 20 minutes). WebCrypto's ECDSA signature is the
// raw r||s that JWS expects, so no DER juggling and no dependency.
//
// Env: APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY (PEM; literal \n accepted),
// APNS_ENV (sandbox | production — required, because a wrong environment
// makes Apple report every token as bad), APNS_BUNDLE_ID (default
// com.thedoorman.app), APNS_BASE (override for a local stub).

// deno-lint-ignore no-explicit-any
type Svc = any;

export interface PushMessage {
  title: string;
  body: string;
  url: string;          // in-app path the tap opens, e.g. /event/<id>
  threadId?: string;    // groups banners (aps.thread-id), usually the event id
  collapseId?: string;  // apns-collapse-id: later pushes replace earlier ones
  ttlSeconds?: number;  // apns-expiration; default 1 hour
}

export interface PushResult {
  devices: number;
  sent: number;
  failed: number;
  removed: number;
  skipped?: string;
}

interface GuestRow {
  guest_user_id?: string | null;
  guest_email?: string | null;
}

const CONCURRENCY = 10;
const BODY_MAX = 180;
const TOKEN_TTL_MS = 50 * 60_000;

function env(name: string): string {
  return (Deno.env.get(name) || '').trim();
}

export function pushConfigured(): boolean {
  return !!(env('APNS_TEAM_ID') && env('APNS_KEY_ID') && env('APNS_PRIVATE_KEY') &&
    /^(sandbox|production)$/.test(env('APNS_ENV')));
}

export function apnsBase(): string {
  const override = env('APNS_BASE');
  if (override) return override.replace(/\/$/, '');
  return env('APNS_ENV') === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

// --- Provider token ----------------------------------------------------------

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let signingKey: CryptoKey | null = null;
let cachedJwt = '';
let cachedAt = 0;

async function importSigningKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const pem = env('APNS_PRIVATE_KEY').replace(/\\n/g, '\n');
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  signingKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  return signingKey;
}

async function providerToken(force = false): Promise<string> {
  if (!force && cachedJwt && Date.now() - cachedAt < TOKEN_TTL_MS) return cachedJwt;
  const key = await importSigningKey();
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: env('APNS_KEY_ID') }));
  const claims = b64url(JSON.stringify({ iss: env('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${claims}`),
  );
  cachedJwt = `${header}.${claims}.${b64url(new Uint8Array(sig))}`;
  cachedAt = Date.now();
  return cachedJwt;
}

// --- Single device -------------------------------------------------------------

function payloadFor(msg: PushMessage) {
  const body = msg.body.length > BODY_MAX ? `${msg.body.slice(0, BODY_MAX - 1)}…` : msg.body;
  return JSON.stringify({
    aps: {
      alert: { title: msg.title, body },
      sound: 'default',
      ...(msg.threadId ? { 'thread-id': msg.threadId } : {}),
    },
    // Top-level, not nested: Capacitor hands the whole userInfo dictionary to
    // JS as notification.data, so this arrives as data.url.
    url: msg.url,
  });
}

export async function sendToDevice(
  token: string, msg: PushMessage,
): Promise<{ status: number; reason?: string; apnsId?: string }> {
  const attempt = async (force: boolean) => {
    const headers: Record<string, string> = {
      authorization: `bearer ${await providerToken(force)}`,
      'apns-topic': env('APNS_BUNDLE_ID') || 'com.thedoorman.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + (msg.ttlSeconds ?? 3600)),
      'content-type': 'application/json',
    };
    if (msg.collapseId) headers['apns-collapse-id'] = msg.collapseId.slice(0, 64);
    const res = await fetch(`${apnsBase()}/3/device/${token}`, {
      method: 'POST', headers, body: payloadFor(msg), signal: AbortSignal.timeout(8000),
    });
    let reason: string | undefined;
    if (!res.ok) {
      try { reason = (await res.json())?.reason; } catch { /* non-JSON body */ }
    } else {
      await res.body?.cancel();
    }
    return { status: res.status, reason, apnsId: res.headers.get('apns-id') || undefined };
  };
  try {
    const first = await attempt(false);
    // Expired/invalid provider token: mint a fresh one and retry once.
    if (first.status === 403 && /ProviderToken/i.test(first.reason || '')) return await attempt(true);
    return first;
  } catch (e) {
    return { status: 0, reason: e instanceof Error ? e.message : String(e) };
  }
}

// --- Fan-out --------------------------------------------------------------------

async function pmap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// Distinct user ids for guestlist rows: the linked account, else the profile
// whose email matches (guests may buy before signing up; the signup trigger
// back-links them, but rows created earlier can lag).
export async function resolveUserIds(svc: Svc, guests: GuestRow[], exclude: string[] = []): Promise<string[]> {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const g of guests) {
    if (g.guest_user_id) ids.add(g.guest_user_id);
    else if (g.guest_email) emails.add(String(g.guest_email).toLowerCase());
  }
  const emailList = [...emails];
  for (let i = 0; i < emailList.length; i += 200) {
    const { data } = await svc.from('profiles').select('id')
      .in('email', emailList.slice(i, i + 200));
    for (const row of data ?? []) ids.add(row.id);
  }
  for (const id of exclude) ids.delete(id);
  return [...ids];
}

export async function sendPushToUsers(svc: Svc, userIds: string[], msg: PushMessage): Promise<PushResult> {
  const users = [...new Set(userIds.filter(Boolean))];
  if (!users.length) return { devices: 0, sent: 0, failed: 0, removed: 0, skipped: 'no recipients' };
  if (!pushConfigured()) {
    console.log(`[push noop — APNS_* unset] users=${users.length} title=${JSON.stringify(msg.title)}`);
    return { devices: 0, sent: 0, failed: 0, removed: 0, skipped: 'unconfigured' };
  }

  const { data: devices, error } = await svc.from('push_devices').select('token, user_id').in('user_id', users);
  if (error) {
    console.log('push: device lookup failed', error.message);
    return { devices: 0, sent: 0, failed: 0, removed: 0, skipped: 'lookup failed' };
  }
  const tokens: string[] = [...new Set<string>((devices ?? []).map((d: { token: string }) => String(d.token)))];
  if (!tokens.length) return { devices: 0, sent: 0, failed: 0, removed: 0, skipped: 'no devices' };

  const results = await pmap(tokens, CONCURRENCY, (token) => sendToDevice(token, msg));
  let sent = 0, failed = 0;
  const dead: string[] = [];
  const badToken: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 200) { sent++; return; }
    failed++;
    if (r.status === 410 || r.reason === 'Unregistered') dead.push(tokens[i]);
    else if (r.status === 400 && r.reason === 'BadDeviceToken') badToken.push(tokens[i]);
    else console.log(`push: ${r.status} ${r.reason || ''} token=${tokens[i].slice(0, 8)}…`);
  });

  // A burst of BadDeviceToken almost always means APNS_ENV points at the
  // wrong environment (sandbox tokens sent to production or vice versa),
  // not a pile of dead devices. Refuse to empty the registry on that signal.
  const suspicious = badToken.length >= 5 && badToken.length * 2 > tokens.length;
  if (suspicious) {
    console.log(`push: ${badToken.length}/${tokens.length} BadDeviceToken — check APNS_ENV; tokens kept`);
  } else {
    dead.push(...badToken);
  }
  let removed = 0;
  if (dead.length) {
    const { error: delErr } = await svc.from('push_devices').delete().in('token', dead);
    if (delErr) console.log('push: dead-token cleanup failed', delErr.message);
    else removed = dead.length;
  }
  return { devices: tokens.length, sent, failed, removed };
}

// Guestlist rows → their users' devices.
export async function notifyGuestsPush(
  svc: Svc, guests: GuestRow[], msg: PushMessage, exclude: string[] = [],
): Promise<PushResult> {
  try {
    const users = await resolveUserIds(svc, guests, exclude);
    return await sendPushToUsers(svc, users, msg);
  } catch (e) {
    console.log('push: fan-out failed', e instanceof Error ? e.message : String(e));
    return { devices: 0, sent: 0, failed: 0, removed: 0, skipped: 'error' };
  }
}
