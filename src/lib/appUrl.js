import { isNative } from "@/lib/native";

// URL helpers that must work both on the web (origin = the site) and inside
// the native shell (origin = capacitor://localhost, which no email, Stripe
// or OAuth redirect may ever point at). Kept free of data.js imports so
// data.js itself can use them.

const DOMAIN_KEY = "doorman_link_domain";

// The canonical live domain for shareable links. All promoter tracking links,
// event share links, ticket-sale QR codes, and checkout redirects use this so
// they resolve to the real app regardless of where the code is running (preview
// sandbox, staging, native shell). Hosts can override it from the Promoter panel.
export const DEFAULT_LINK_DOMAIN = "https://thedoorman.app";

export function getLinkDomain() {
  try {
    const stored = localStorage.getItem(DOMAIN_KEY);
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  return DEFAULT_LINK_DOMAIN;
}

export function setLinkDomain(raw) {
  let v = String(raw || "").trim();
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    if (!v) {
      localStorage.removeItem(DOMAIN_KEY);
      return DEFAULT_LINK_DOMAIN;
    }
    const origin = new URL(v).origin;
    localStorage.setItem(DOMAIN_KEY, origin);
    return origin;
  } catch {
    return DEFAULT_LINK_DOMAIN;
  }
}

// Base for URLs that leave the app and come back (auth emails, password
// reset, Stripe returns, share links). On the web that is the current origin;
// in the native shell it is the public site, which universal links route back
// into the app.
export function appBaseUrl() {
  return isNative() ? getLinkDomain() : window.location.origin;
}

// Reduce a URL to an in-app path (pathname + search + hash) when it belongs to
// this app — the WebView origin or the public site — otherwise null. Used for
// post-login "next" targets and deep links so we never navigate off-site.
export function toAppPath(urlLike) {
  if (!urlLike) return null;
  try {
    const url = new URL(String(urlLike), window.location.origin);
    const ours = new Set([window.location.origin, appBaseUrl(), getLinkDomain()]);
    if (!ours.has(url.origin)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
