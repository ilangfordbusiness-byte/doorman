// Meta Pixel for organiser ad tracking. A business account can set its own
// Pixel ID; the pixel is loaded only on that business's event + checkout
// pages, never app-wide, and every call targets that specific pixel
// (trackSingle) so two businesses' pixels in one browser session never
// cross-fire. The server-side Purchase (Conversions API, ticketWebhook)
// shares the order id as eventID so Meta deduplicates the pair.

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

// Browser match keys for the Conversions API: the pixel's _fbp cookie and the
// click id (_fbc cookie, or derived from an fbclid landing parameter the
// pixel has not yet turned into a cookie).
export function metaMatchKeys() {
  try {
    let fbc = readCookie("_fbc");
    if (!fbc) {
      const fbclid = new URLSearchParams(window.location.search).get("fbclid");
      if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
    return {
      fbp: readCookie("_fbp"),
      fbc,
      source_url: window.location.origin + window.location.pathname,
    };
  } catch {
    return { fbp: null, fbc: null, source_url: null };
  }
}
