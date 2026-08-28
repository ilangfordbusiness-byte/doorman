// Email via Resend (replaces the original app Core.SendEmail). Never throws — returns
// { sent, error } so callers log failures without blocking the main flow.
// With no RESEND_API_KEY set (local dev), logs and no-ops.
export async function sendEmail(
  { to, subject, html }: { to: string; subject: string; html: string },
): Promise<{ sent: boolean; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'DoorMan <tickets@thedoorman.app>';
  if (!key) {
    console.log(`[email noop — RESEND_API_KEY unset] to=${to} subject=${subject}`);
    return { sent: false, error: 'RESEND_API_KEY not set' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
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

// Timezone label for the event's date. Events are UK-hosted, so times are
// Europe/London wall-clock: "BST" in summer, "GMT" in winter.
export function ukTimeSuffix(dateStr?: string | null): string {
  try {
    const d = dateStr ? new Date(`${dateStr}T12:00:00Z`) : new Date();
    const tz = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', timeZoneName: 'short',
    }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value;
    return tz ? ` ${tz}` : '';
  } catch {
    return '';
  }
}

// "21:00 – 03:00 BST" from an event row; '' when there is no start time.
// deno-lint-ignore no-explicit-any
export function formatTimeRange(event: any): string {
  const start = typeof event.start_time === 'string' ? event.start_time.slice(0, 5) : '';
  if (!start) return '';
  const end = typeof event.end_time === 'string' ? event.end_time.slice(0, 5) : '';
  return `${start}${end ? ` – ${end}` : ''}${ukTimeSuffix(event.date)}`;
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
    <p style="margin:24px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
  </div>
</body>
</html>`;
}
