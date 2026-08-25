// Email via Resend (replaces Base44 Core.SendEmail). Never throws — returns
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
