// Records (or lifts) an email opt-out. Two callers, both without a session:
//   - the /unsubscribe page, POSTing JSON { e, t, action } where action is
//     'status' | 'unsubscribe' | 'resubscribe';
//   - mailbox providers doing the RFC 8058 one-click unsubscribe: a
//     form-encoded POST "List-Unsubscribe=One-Click" to the URL in our
//     List-Unsubscribe header, so e and t arrive in the query string.
// verify_jwt=false — the HMAC token in the link is the authentication; it is
// only ever held by whoever received our email for that address.
import { json, preflight, serviceClient } from '../_shared/db.ts';
import { fromBase64url, normalizeEmail, verifyUnsubscribeToken } from '../_shared/email.ts';

const ACTIONS = new Set(['status', 'unsubscribe', 'resubscribe']);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = new URL(req.url);
    let e = url.searchParams.get('e') ?? '';
    let t = url.searchParams.get('t') ?? '';
    let action = 'unsubscribe';
    let source = 'page';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (typeof body.e === 'string') e = body.e;
      if (typeof body.t === 'string') t = body.t;
      if (typeof body.action === 'string') action = body.action;
    } else {
      // One-click POST from a mail client. Anything else form-shaped without
      // the marker is treated the same: a POST to this URL means unsubscribe.
      const form = new URLSearchParams(await req.text().catch(() => ''));
      if (form.get('List-Unsubscribe') === 'One-Click') source = 'one-click';
    }
    if (!ACTIONS.has(action)) return json({ error: 'Unknown action' }, 400);

    const email = normalizeEmail(fromBase64url(e));
    if (!email.includes('@') || !t) return json({ error: 'This link is not valid' }, 400);
    if (!(await verifyUnsubscribeToken(email, t))) return json({ error: 'This link is not valid' }, 403);

    const svc = serviceClient();
    if (action === 'unsubscribe') {
      const { error } = await svc.from('email_unsubscribes')
        .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else if (action === 'resubscribe') {
      const { error } = await svc.from('email_unsubscribes').delete().eq('email', email);
      if (error) throw new Error(error.message);
    }
    const { data, error } = await svc.from('email_unsubscribes')
      .select('email').eq('email', email).maybeSingle();
    if (error) throw new Error(error.message);
    return json({ ok: true, email, unsubscribed: !!data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('unsubscribeEmail error', msg);
    return json({ error: msg }, 500);
  }
});
