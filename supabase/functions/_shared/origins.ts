// Redirect targets we hand to Stripe (Checkout success/cancel, Connect
// return/refresh) must point at the app, never at whatever Origin header a
// client sends. The allow-list is APP_ORIGIN (the public site) plus
// ALLOWED_ORIGINS; a request from an allow-listed origin puts that origin
// first so previews return to themselves. The iOS app's origin
// (capacitor://localhost) is never on the list: the client passes explicit
// https URLs on the public site, which the app handles as universal links or
// through its /native/return page.

export function allowedOrigins(req: Request): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin');
  const list = [Deno.env.get('APP_ORIGIN') || 'https://thedoorman.app', ...extra];
  if (origin && list.includes(origin)) return [origin, ...list];
  return list;
}

// `url` if its origin is allow-listed, otherwise `fallback` (open-redirect guard).
export function safeRedirect(origins: string[], url: string | undefined | null, fallback: string): string {
  if (!url) return fallback;
  try {
    return origins.includes(new URL(url).origin) ? url : fallback;
  } catch {
    return fallback;
  }
}

// Append a query parameter to a URL that may or may not already have a query.
export function withParam(url: string, key: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}
