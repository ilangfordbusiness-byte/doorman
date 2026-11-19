// Per-event link previews (Open Graph / Twitter cards).
//
// The app is a static SPA: every route is served the same index.html, whose OG
// tags are generic DoorMan. Link-unfurling crawlers (iMessage, WhatsApp, X,
// Slack, Facebook, …) don't run the React app, so a shared /event/:id link
// shows the generic card instead of the event's cover + name.
//
// This Vercel function handles /event/:id, /invite/:code and /b/:id (wired in
// vercel.json): it fetches the PUBLIC title/cover/description from Supabase
// (anon key — published events, valid invite codes, and the anon-readable
// business_public view), then returns the normal SPA shell with the
// OG/Twitter/title tags swapped in. A /b/:id business link is labelled as an
// event host's profile, with its picture and upcoming/past event counts. Users still get the full app (the real hashed asset tags are left
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
    if (type === "business" && id) {
      const bid = encodeURIComponent(id);
      const today = new Date().toISOString().slice(0, 10);
      const count = async (dateFilter) => {
        // HEAD + count=exact: just the number, no rows.
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/events?business_id=eq.${bid}&status=eq.published&is_public=eq.true&${dateFilter}&select=id`,
          { method: "HEAD", headers: { ...headers, Prefer: "count=exact" } },
        );
        const total = Number((r.headers.get("content-range") || "").split("/")[1]);
        return r.ok && Number.isFinite(total) ? total : null;
      };
      const [bizRes, upcoming, past] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/business_public?id=eq.${bid}&select=business_name,business_picture_url,description&limit=1`, { headers }),
        count(`date=gte.${today}`).catch(() => null),
        count(`date=lt.${today}`).catch(() => null),
      ]);
      if (!bizRes.ok) return null;
      const rows = await bizRes.json();
      const b = Array.isArray(rows) ? rows[0] : null;
      if (!b || !b.business_name) return null;
      const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const stats = [
        upcoming ? plural(upcoming, "upcoming event") : null,
        past ? plural(past, "past event") : null,
      ].filter(Boolean).join(" · ");
      // Bios are often one phrase per line; keep them readable as one line.
      const bio = String(b.description || "").split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
        .map((l) => (/[.!?…]$/.test(l) ? l : `${l}.`)).join(" ");
      return {
        title: `${b.business_name} · Event host on DoorMan`,
        image: b.business_picture_url,
        description: [`Host profile${stats ? ` · ${stats}` : ""}.`, bio].filter(Boolean).join(" "),
        ogType: "profile",
        card: "summary", // square logo, not a wide cover
      };
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
  const canonicalPath = type === "invite" ? `/invite/${code || ""}`
    : type === "business" ? `/b/${id || ""}`
    : `/event/${id || ""}`;

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
      `<title>${ev.ogType === "profile" ? title : `${title} · DoorMan`}</title>`,
      `<meta name="description" content="${desc}" />`,
      `<meta property="og:type" content="${ev.ogType || "website"}" />`,
      `<meta property="og:site_name" content="DoorMan" />`,
      `<meta property="og:url" content="${pageUrl}" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta name="twitter:card" content="${ev.card || "summary_large_image"}" />`,
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
