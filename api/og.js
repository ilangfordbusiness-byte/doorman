// Per-event link previews (Open Graph / Twitter cards).
//
// The app is a static SPA: every route is served the same index.html, whose OG
// tags are generic DoorMan. Link-unfurling crawlers (iMessage, WhatsApp, X,
// Slack, Facebook, …) don't run the React app, so a shared /event/:id link
// shows the generic card instead of the event's cover + name.
//
// This Vercel function handles /event/:id and /invite/:code (wired in
// vercel.json): it fetches the event's PUBLIC title/cover/description from
// Supabase (anon key — published events and valid invite codes only), then
// returns the normal SPA shell with the OG/Twitter/title tags swapped for the
// event's. Users still get the full app (the real hashed asset tags are left
// untouched); crawlers get the rich preview. Unknown/draft events fall back to
// the generic card.

const DOMAIN = "https://thedoorman.app";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function absImage(src) {
  if (!src) return `${DOMAIN}/logo.png`;
  return /^https?:\/\//i.test(src) ? src : `${DOMAIN}${src.startsWith("/") ? "" : "/"}${src}`;
}

async function fetchEvent({ type, id, code }) {
  if (!SUPABASE_URL || !ANON) return null;
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  try {
    if (type === "event" && id) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=title,cover_image_url,description&limit=1`,
        { headers },
      );
      if (!r.ok) return null;
      const rows = await r.json();
      const ev = Array.isArray(rows) ? rows[0] : null;
      return ev ? { title: ev.title, image: ev.cover_image_url, description: ev.description } : null;
    }
    if (type === "invite" && code) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_event_by_invite`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_invite_code: code }),
      });
      if (!r.ok) return null;
      const ev = await r.json();
      return ev && ev.title ? { title: ev.title, image: ev.cover_image, description: ev.description } : null;
    }
  } catch {
    return null;
  }
  return null;
}

export default async function handler(req, res) {
  const url = new URL(req.url, DOMAIN);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const code = url.searchParams.get("code");
  const canonicalPath = type === "invite" ? `/invite/${code || ""}` : `/event/${id || ""}`;

  // The built SPA shell (with the correct hashed asset tags). Served statically;
  // /index.html is not rewritten to this function, so there's no loop.
  const host = req.headers["x-forwarded-host"] || req.headers.host || "thedoorman.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  let html;
  try {
    const base = await fetch(`${proto}://${host}/index.html`);
    html = await base.text();
  } catch {
    // Can't get the shell — bounce to the route so the app still loads.
    res.statusCode = 302;
    res.setHeader("Location", canonicalPath);
    return res.end();
  }

  const ev = await fetchEvent({ type, id, code });
  if (ev && ev.title) {
    const title = esc(ev.title);
    const desc = esc(ev.description || "You're invited — tap to see the details and RSVP on DoorMan.");
    const image = esc(absImage(ev.image));
    const pageUrl = esc(`${DOMAIN}${canonicalPath}`);
    const tags = [
      `<title>${title} · DoorMan</title>`,
      `<meta name="description" content="${desc}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="DoorMan" />`,
      `<meta property="og:url" content="${pageUrl}" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${desc}" />`,
      `<meta name="twitter:image" content="${image}" />`,
    ].join("\n    ");

    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name="description"[^>]*>/gi, "")
      .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
      .replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Edge-cache the rendered shell briefly so an event edit propagates within
  // minutes while keeping crawlers (and users) fast.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.statusCode = 200;
  res.end(html);
}
