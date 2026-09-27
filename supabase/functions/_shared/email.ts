import { serviceClient } from './db.ts';
import { timeZoneSuffix } from './eventTime.ts';
// Email via Resend (replaces the original app Core.SendEmail). Never throws — returns
// { sent, error } so callers log failures without blocking the main flow.
// With no RESEND_API_KEY set (local dev), logs and no-ops.
//
// Deliverability: every email carries a plain-text alternative (HTML-only
// mail scores worse with Gmail/Outlook filters), and `bulk` sends — the
// notifications that go to a whole guestlist — add List-Unsubscribe headers
// (URL + mailto, plus the RFC 8058 one-click POST), which mailbox providers
// expect from anything sent to many recipients at once.
//
// Unsubscribe: every email's footer carries a per-recipient link to
// /unsubscribe, signed with an HMAC so it needs no session; the page and the
// one-click POST land in the unsubscribeEmail function, which records the
// address in email_unsubscribes. `bulk` sends check that list first and skip
// opted-out addresses. Transactional mail (tickets bought, transfers sent to
// you) is not bulk and always goes out — it is the receipt for something the
// recipient did or was given, and the footer says so.
export async function sendEmail(
  { to, subject, html, text, bulk = false }: {
    to: string; subject: string; html: string; text?: string; bulk?: boolean;
  },
): Promise<{ sent: boolean; error?: string; skipped?: boolean }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'DoorMan <tickets@thedoorman.app>';
  const recipient = normalizeEmail(to);
  try {
    // Opted-out addresses never get notification mail. The check runs before
    // the RESEND_API_KEY noop so local runs log the skip too, and a failed
    // lookup counts as opted out: better a missed reminder than mail to
    // someone who asked us to stop.
    if (bulk && await isUnsubscribed(recipient)) {
      console.log(`[email skipped — unsubscribed] to=${to} subject=${subject}`);
      return { sent: false, skipped: true, error: 'unsubscribed' };
    }
    if (!key) {
      console.log(`[email noop — RESEND_API_KEY unset] to=${to} subject=${subject}`);
      return { sent: false, error: 'RESEND_API_KEY not set' };
    }
    const unsubUrl = await unsubscribeUrl(recipient);
    const finalHtml = withFooter(html, unsubUrl);
    const headers: Record<string, string> = {};
    if (bulk) {
      const addr = fromAddress(from);
      headers['List-Unsubscribe'] =
        `<${unsubUrl}>, <mailto:${addr}?subject=${encodeURIComponent(`unsubscribe ${to}`)}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject, html: finalHtml,
        text: text || htmlToText(finalHtml),
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log('sendEmail error', err);
      return { sent: false, error: err };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('sendEmail error', msg);
    return { sent: false, error: msg };
  }
}

// "DoorMan <tickets@x>" -> "tickets@x"
export function fromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

// --- Unsubscribe link + opt-out list -----------------------------------------
// The link is /unsubscribe?e=<base64url email>&t=<hmac>. The HMAC (keyed by
// UNSUBSCRIBE_SECRET, falling back to the AUTOMATION_SECRET every deployment
// already has) is what lets the page and the one-click POST act on an address
// with no session: only something that received our email holds a valid token.

function unsubscribeSecret(): string {
  return Deno.env.get('UNSUBSCRIBE_SECRET') || Deno.env.get('AUTOMATION_SECRET') || '';
}

export function base64url(input: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(input)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(input: string): string {
  try {
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export async function unsubscribeToken(email: string): Promise<string> {
  const secret = unsubscribeSecret();
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET / AUTOMATION_SECRET not set');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`unsubscribe:${normalizeEmail(email)}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison against a freshly computed token.
export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  const expected = await unsubscribeToken(email);
  const given = String(token ?? '');
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function unsubscribeUrl(email: string): Promise<string> {
  const addr = normalizeEmail(email);
  return `${appOrigin()}/unsubscribe?e=${base64url(addr)}&t=${await unsubscribeToken(addr)}`;
}

// Throws on a failed lookup so the caller treats the address as opted out.
export async function isUnsubscribed(email: string): Promise<boolean> {
  const { data, error } = await serviceClient().from('email_unsubscribes')
    .select('email').eq('email', normalizeEmail(email)).maybeSingle();
  if (error) throw new Error(`unsubscribe lookup failed: ${error.message}`);
  return !!data;
}

// Every email template ends with this slot; sendEmail fills it with the
// recipient's unsubscribe link and the "Powered by DoorMan" line.
export const FOOTER_SLOT = '<!--doorman:footer-->';

export function emailFooter(): string {
  return FOOTER_SLOT;
}

function withFooter(html: string, unsubUrl: string): string {
  const footer = `<p style="margin:24px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
    <p style="margin:12px 0 0;text-align:center;"><a href="${unsubUrl}" style="display:inline-block;padding:6px 14px;border:1px solid #2a2a3a;border-radius:999px;font-size:11px;color:#7a7a9a;text-decoration:none;">Unsubscribe from notification emails</a></p>`;
  if (html.includes(FOOTER_SLOT)) return html.replace(FOOTER_SLOT, footer);
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + footer : html.slice(0, i) + footer + html.slice(i);
}

// Plain-text rendering of our email HTML: links become "label: url", images
// their alt text, block elements line breaks. Good enough for a text/plain
// alternative; not a general HTML converter.
export function htmlToText(html: string): string {
  let t = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return l && l !== href ? `${l}: ${href}` : href;
    })
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, '[$1]\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  t = t
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function escapeHtml(str: unknown): string {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export function appOrigin(): string {
  return Deno.env.get('APP_ORIGIN') || 'https://thedoorman.app';
}

// --- Shared branded layout (the ticket/transfer email design) -----------------
// All outbound email uses this shell so every template matches: dark ground,
// centered kicker/title, cards, purple primary button, "Powered by DoorMan".

export function formatEventDateLong(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// "21:00 – 03:00 BST" / "20:00 – 23:00 EDT" from an event row, labelled with
// the event's own zone (events.timezone); '' when there is no start time.
// deno-lint-ignore no-explicit-any
export function formatTimeRange(event: any): string {
  const start = typeof event.start_time === 'string' ? event.start_time.slice(0, 5) : '';
  if (!start) return '';
  const end = typeof event.end_time === 'string' ? event.end_time.slice(0, 5) : '';
  return `${start}${end ? ` – ${end}` : ''}${timeZoneSuffix(event)}`;
}

export function emailCard(label: string | null, innerHtml: string): string {
  return `<div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:20px;margin-top:16px;">
      ${label ? `<p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7a7a9a;">${escapeHtml(label)}</p>` : ''}
      ${innerHtml}
    </div>`;
}

// Label/value lines for a card; rows with an empty value are dropped.
export function detailRows(rows: [string, unknown][]): string {
  const lines = rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([l, v]) => `<div><span style="color:#7a7a9a;">${escapeHtml(l)}:</span> ${escapeHtml(v)}</div>`)
    .join('');
  return `<div style="font-size:14px;color:#e8e8f0;line-height:1.7;">${lines}</div>`;
}

export function brandedEmail(opts: {
  kicker: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  buttons?: { label: string; href: string; secondary?: boolean }[];
  footnote?: string;
}): string {
  const buttons = (opts.buttons ?? []).map((b) => {
    const base = 'display:inline-block;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;margin:4px;color:#ffffff;';
    const skin = b.secondary
      ? 'background:#1f1f2e;border:1px solid #2a2a3a;'
      : 'background:#7c3aed;';
    return `<a href="${b.href}" style="${base}${skin}">${escapeHtml(b.label)}</a>`;
  }).join('');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · ${escapeHtml(opts.kicker)}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;text-align:center;">${escapeHtml(opts.title)}</h1>
    ${opts.subtitle ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">${escapeHtml(opts.subtitle)}</p>` : ''}
    ${opts.bodyHtml}
    ${buttons ? `<div style="text-align:center;margin:24px 0 20px;">${buttons}</div>` : ''}
    ${opts.footnote ? `<p style="margin:0;text-align:center;font-size:11px;color:#7a7a9a;line-height:1.6;">${opts.footnote}</p>` : ''}
    ${emailFooter()}
  </div>
</body>
</html>`;
}
