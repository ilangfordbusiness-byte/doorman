// Link previews (Open Graph / Twitter cards) for every shareable link.
//
// The app is a static SPA: every route is served the same index.html, whose OG
// tags are generic DoorMan. Link-unfurling crawlers (iMessage, WhatsApp, X,
// Slack, Facebook, …) don't run the React app, so without this a shared link
// shows the generic card instead of what it points at.
//
// vercel.json rewrites these routes here:
//   /event/:id (+ promoter ?ref=)   event title, cover, description
//   /invite/:code                   the invited event
//   /event/:id/checkout (+ ?door=)  "Tickets · <event>"
//   /pass/:id                       "Guest pass · <event>" (never the QR)
//   /b/:id                          business, labelled as an event host
//   /business/:id/invite            "Join <business> on DoorMan"
//   /dj/:id                         DJ profile (get_dj_link_preview)
// Everything is read with the anon key, so only already-public data shows:
// published events, valid invite codes, the business_public view, and the DJ
// RPC (which returns null for anyone not billed on a public event). Users
// still get the full app (the real hashed asset tags are left untouched);
// unknown, private or draft targets fall back to the generic card.

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

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Multi-line bios/descriptions as one readable line, capped for card text.
function oneLine(text, max = 220) {
  const s = String(text || "").split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
    .map((l) => (/[.!?…:]$/.test(l) ? l : `${l}.`)).join(" ");
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// "2026-11-22" -> "Sat 22 Nov" (the event's calendar date, no timezone shift).
function dayLabel(date) {
  const d = new Date(`${String(date || "").slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

async function fetchPreview({ type, id, code }) {
  if (!SUPABASE_URL || !ANON) return null;
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  const rest = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  };
  const rpc = async (fn, args) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    return r.ok ? r.json() : null;
  };
  const getEvent = (eid) => rest(`events?id=eq.${encodeURIComponent(eid)}&select=title,cover_image_url,description,date&limit=1`);
  const getBusiness = (bid) => rest(`business_public?id=eq.${encodeURIComponent(bid)}&select=business_name,business_picture_url,description&limit=1`);

  try {
    // Event page, including promoter links (/event/:id?ref=...).
    if (type === "event" && id) {
      const ev = await getEvent(id);
      return ev ? { title: ev.title, image: ev.cover_image_url, description: oneLine(ev.description) } : null;
    }
    // Private invite link.
    if (type === "invite" && code) {
      const ev = await rpc("get_event_by_invite", { p_invite_code: code });
      return ev && ev.title ? { title: ev.title, image: ev.cover_image, description: oneLine(ev.description) } : null;
    }
    // Ticket checkout, incl. the door QR (/event/:id/checkout?door=...).
    if (type === "checkout" && id) {
      const ev = await getEvent(id);
      if (!ev) return null;
      const when = dayLabel(ev.date);
      return {
        title: `Tickets · ${ev.title}`,
        image: ev.cover_image_url,
        description: `Get tickets${when ? ` for ${when}` : ""} on DoorMan.`,
      };
    }
    // Guest pass (from ticket emails). Event details only; never the QR.
    if (type === "pass" && id) {
      const ev = await getEvent(id);
      if (!ev) return null;
      const when = dayLabel(ev.date);
      return {
        title: `Guest pass · ${ev.title}`,
        image: ev.cover_image_url,
        description: `${when ? `${when}. ` : ""}Open your QR pass in DoorMan and show it at the door.`,
      };
    }
    // Public business (host) profile.
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
      const [b, upcoming, past] = await Promise.all([
        getBusiness(id),
        count(`date=gte.${today}`).catch(() => null),
        count(`date=lt.${today}`).catch(() => null),
      ]);
      if (!b || !b.business_name) return null;
      const stats = [
        upcoming ? plural(upcoming, "upcoming event") : null,
        past ? plural(past, "past event") : null,
      ].filter(Boolean).join(" · ");
      return {
        title: `${b.business_name} · Event host on DoorMan`,
        image: b.business_picture_url,
        description: [`Host profile${stats ? ` · ${stats}` : ""}.`, oneLine(b.description)].filter(Boolean).join(" "),
        ogType: "profile",
        card: "summary", // square logo, not a wide cover
      };
    }
    // Invite to join a business's team (from the invite email).
    if (type === "team" && id) {
      const b = await getBusiness(id);
      if (!b || !b.business_name) return null;
      return {
        title: `Join ${b.business_name} on DoorMan`,
        image: b.business_picture_url,
        description: `You've been invited to help run ${b.business_name}'s events on DoorMan. Open the link to accept.`,
        card: "summary",
      };
    }
    // DJ (performer) profile. Null unless they're billed on a public event.
    if (type === "dj" && id) {
      const dj = await rpc("get_dj_link_preview", { p_id: id });
      if (!dj || !dj.name) return null;
      const stats = [
        dj.upcoming ? plural(dj.upcoming, "upcoming set") : null,
        dj.past ? plural(dj.past, "past set") : null,
      ].filter(Boolean).join(" · ");
      const genres = String(dj.genres || "").trim();
      return {
        title: `${dj.name} · DJ on DoorMan`,
        image: dj.avatar_url,
        description: [`DJ profile${stats ? ` · ${stats}` : ""}.`, genres ? `${oneLine(genres, 80)}` : "", oneLine(dj.bio, 160)]
          .filter(Boolean).join(" "),
        ogType: "profile",
        card: "summary",
      };
    }
  } catch {
    return null;
  }
  return null;
}

// The route each preview type stands in for (og:url / redirect fallback).
const PATHS = {
  event: ({ id }) => `/event/${id}`,
  invite: ({ code }) => `/invite/${code}`,
  checkout: ({ id }) => `/event/${id}/checkout`,
  pass: ({ id }) => `/pass/${id}`,
  business: ({ id }) => `/b/${id}`,
  team: ({ id }) => `/business/${id}/invite`,
  dj: ({ id }) => `/dj/${id}`,
};

export default async function handler(req, res) {
  const url = new URL(req.url, DOMAIN);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const code = url.searchParams.get("code");
  const canonicalPath = (PATHS[type] || PATHS.event)({ id: id || "", code: code || "" });

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

  const ev = await fetchPreview({ type, id, code });
  if (ev && ev.title) {
    const title = esc(ev.title);
    const desc = esc(ev.description || "You're invited — tap to see the details and RSVP on DoorMan.");
    const image = esc(absImage(ev.image));
    // Keep the share button's ?v= (withPreviewVersion in src/lib/appUrl.js):
    // Meta's scrapers cache by og:url, so dropping it would bring back the
    // stale card the version exists to avoid.
    const v = url.searchParams.get("v");
    const pageUrl = esc(`${DOMAIN}${canonicalPath}${v && /^[0-9a-z]{1,8}$/.test(v) ? `?v=${v}` : ""}`);
    const tags = [
      `<title>${/DoorMan/.test(ev.title) ? title : `${title} · DoorMan`}</title>`,
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
