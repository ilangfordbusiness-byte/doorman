// Meta Pixel for organiser ad tracking. A business account can set its own
// Pixel ID; the pixel is loaded only on that business's event + checkout
// pages, never app-wide, and every call targets that specific pixel
// (trackSingle) so two businesses' pixels in one browser session never
// cross-fire. The server-side Purchase (Conversions API, ticketWebhook)
// shares the order id as eventID so Meta deduplicates the pair.
import { isNative } from "@/lib/native";
import { appBaseUrl } from "@/lib/appUrl";

const initialised = new Set();
/** @type {any} */
const w = window;

function ensureScript() {
  if (w.fbq) return;
  // Standard Meta base code: a queueing stub until fbevents.js loads.
  /** @type {any} */
  const n = (w.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  });
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
}

// Load the pixel (once per id) and fire its PageView.
export function loadPixel(pixelId) {
  const id = String(pixelId || "").trim();
  if (!/^\d{5,20}$/.test(id) || initialised.has(id)) return;
  // No browser pixel inside the iOS app: loading Meta's script there would
  // require the App Tracking Transparency prompt. Purchases still reach Meta
  // through the server-side Conversions API from ticketWebhook.
  if (isNative()) return;
  try {
    ensureScript();
    w.fbq("init", id);
    w.fbq("trackSingle", id, "PageView");
    initialised.add(id);
  } catch {
    // Ad blockers can neuter fbq; tracking is never allowed to break the page.
  }
}

// Fire a standard event on one pixel. eventId enables server-side dedup.
export function trackPixel(pixelId, eventName, params = {}, eventId) {
  const id = String(pixelId || "").trim();
  if (!id) return;
  loadPixel(id);
  try {
    if (eventId) w.fbq("trackSingle", id, eventName, params, { eventID: String(eventId) });
    else w.fbq("trackSingle", id, eventName, params);
  } catch {
    // see above
  }
}

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// Meta appends ?fbclid=... to every ad click. Meta's own script turns it into
// the _fbc cookie, but that script is blocked for many visitors (ad blockers,
// tracking protection), so DoorMan keeps its own copy of the click id. Stored
// per browser for 90 days, Meta's attribution window ceiling.
const CLICK_KEY = "meta_click";
const CLICK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function captureMetaClick() {
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return;
    localStorage.setItem(CLICK_KEY, JSON.stringify({ fbclid, ts: Date.now() }));
  } catch {
    // storage unavailable: the cookie path (if any) still applies
  }
}

function storedClick() {
  try {
    const raw = localStorage.getItem(CLICK_KEY);
    if (!raw) return null;
    const { fbclid, ts } = JSON.parse(raw);
    if (!fbclid || !ts || Date.now() - ts > CLICK_TTL_MS) return null;
    return { fbclid, ts };
  } catch {
    return null;
  }
}

// Browser match keys for the Conversions API: the pixel's _fbp cookie and the
// click id as an fbc value (Meta's documented format fb.1.<ms>.<fbclid>),
// taken from the _fbc cookie, the current URL, or our own stored capture.
export function metaMatchKeys() {
  try {
    captureMetaClick();
    let fbc = readCookie("_fbc");
    if (!fbc) {
      const click = storedClick();
      if (click) fbc = `fb.1.${click.ts}.${click.fbclid}`;
    }
    return {
      fbp: readCookie("_fbp"),
      fbc,
      source_url: appBaseUrl() + window.location.pathname,
    };
  } catch {
    return { fbp: null, fbc: null, source_url: null };
  }
}
