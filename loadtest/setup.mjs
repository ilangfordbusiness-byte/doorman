// Creates the load-test fixtures on the target stack and writes out/state.json:
//   1 host (payout-ready), STAFF scanner accounts, GUESTS ticket holders (one
//   paid order + issued ticket each), BUYERS accounts with no ticket yet, one
//   published paid event with a big "General" tier and a small "Scarce" tier.
// Every account signs in so the k6 scripts can act as real users (RLS on).
//
//   node loadtest/setup.mjs [--guests 250] [--staff 25] [--buyers 60] [--tokens-only]
import { cfg, requireKeys, svcHeaders, rest, pmap, saveState, loadState } from "./lib/env.mjs";

requireKeys();
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean));
const GUESTS = Number(args.guests || 250);
const STAFF = Number(args.staff || 25);
const BUYERS = Number(args.buyers || 60);
const SEED = Date.now().toString(36);
const STRIPE_ACCOUNT = process.env.LT_STRIPE_ACCOUNT || ""; // a charges-enabled connected account (test mode)

const email = (kind, i) => `${cfg.run}-${kind}-${String(i).padStart(3, "0")}@${cfg.domain}`;

async function adminCreateUser(mail, name) {
  const res = await fetch(`${cfg.auth}/admin/users`, {
    method: "POST", headers: svcHeaders(),
    body: JSON.stringify({ email: mail, password: cfg.password, email_confirm: true, user_metadata: { full_name: name } }),
  });
  const data = await res.json();
  if (res.ok) return data.id;
  if (/already|exists|registered/i.test(JSON.stringify(data))) {
    const rows = await rest("GET", `profiles?select=id&email=eq.${encodeURIComponent(mail)}`);
    if (rows[0]) return rows[0].id;
  }
  throw new Error(`create ${mail}: ${res.status} ${JSON.stringify(data)}`);
}

async function signIn(mail) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${cfg.auth}/token?grant_type=password`, {
      method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail, password: cfg.password }),
    });
    if (res.ok) {
      const d = await res.json();
      return { access_token: d.access_token, refresh_token: d.refresh_token };
    }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    throw new Error(`sign-in ${mail}: ${res.status} ${await res.text()}`);
  }
  throw new Error(`sign-in ${mail}: rate limited`);
}

async function ensureUsers(kind, n) {
  const list = Array.from({ length: n }, (_, i) => ({ email: email(kind, i + 1), name: `LT ${kind} ${i + 1}` }));
  const t0 = Date.now();
  const ids = await pmap(list, 8, (u) => adminCreateUser(u.email, u.name));
  console.log(`  ${n} ${kind} accounts ready in ${Date.now() - t0} ms`);
  return list.map((u, i) => ({ ...u, id: ids[i] }));
}

async function signInAll(users, label) {
  const t0 = Date.now();
  const lat = [];
  const toks = await pmap(users, 8, async (u) => {
    const s = Date.now();
    const t = await signIn(u.email);
    lat.push(Date.now() - s);
    return t;
  });
  lat.sort((a, b) => a - b);
  console.log(`  ${users.length} ${label} sign-ins in ${Date.now() - t0} ms (p50 ${lat[Math.floor(lat.length / 2)]} ms, max ${lat[lat.length - 1]} ms)`);
  return users.map((u, i) => ({ ...u, ...toks[i] }));
}

async function main() {
  if (args["tokens-only"]) {
    const st = loadState();
    console.log("Refreshing tokens only");
    st.host = (await signInAll([st.host], "host"))[0];
    st.staff = await signInAll(st.staff, "staff");
    st.guests = await signInAll(st.guests, "guest");
    st.buyers = await signInAll(st.buyers, "buyer");
    saveState(st);
    return;
  }

  console.log(`Target ${cfg.url}  run=${cfg.run}  guests=${GUESTS} staff=${STAFF} buyers=${BUYERS}`);

  console.log("Accounts");
  const [host] = await ensureUsers("host", 1);
  const staff = await ensureUsers("staff", STAFF);
  const guests = await ensureUsers("guest", GUESTS);
  const buyers = await ensureUsers("buyer", BUYERS);

  // Payout-ready host so createTicketCheckout accepts paid tickets.
  if (STRIPE_ACCOUNT) {
    await rest("PATCH", `profiles?id=eq.${host.id}`, { stripe_account_id: STRIPE_ACCOUNT, stripe_onboarding_status: "active" });
  } else {
    console.log("  (LT_STRIPE_ACCOUNT unset: checkout scenario will be rejected as not payout-ready)");
  }

  console.log("Event");
  const date = new Date(Date.now() + 13 * 86400e3).toISOString().slice(0, 10);
  const [event] = await rest("POST", "events", {
    host_id: host.id, title: `LOADTEST ${cfg.run} rehearsal`, date, start_time: "21:00", end_time: "03:00",
    venue_name: "Load Test Venue", address: "1 Test St, London", status: "published", is_public: true,
    discoverable: false, requests_open: true, is_paid: true, currency: "gbp", fee_mode: "pass_on",
    visibility: "show_names", capacity: GUESTS + BUYERS + 50, description: "Synthetic event for load testing. Safe to delete.",
  });
  const [tierGeneral] = await rest("POST", "ticket_tiers", { event_id: event.id, name: "General", price_minor: 1000, quantity: GUESTS + BUYERS + 50, sort_order: 0 });
  const [tierScarce] = await rest("POST", "ticket_tiers", { event_id: event.id, name: "Scarce", price_minor: 500, quantity: 20, sort_order: 1 });

  await rest("POST", "event_staff", staff.map((s) => ({ event_id: event.id, user_id: s.id, email: s.email, name: s.name, role: "doorman", created_by: host.id })));

  console.log("Tickets (one paid order + issued entry per guest)");
  const orders = await rest("POST", "ticket_orders", guests.map((g) => ({
    event_id: event.id, tier_id: tierGeneral.id, guest_user_id: g.id, guest_email: g.email, guest_name: g.name,
    quantity: 1, unit_price_minor: 1000, paid_minor: 1085, platform_fee_minor: 85, host_net_minor: 1000,
    currency: "gbp", status: "paid", stripe_session_id: `cs_test_${cfg.run}_seed_${SEED}_${g.id}`, stripe_payment_intent_id: `pi_${cfg.run}_seed_${SEED}_${g.id}`,
  })));
  const entries = await rest("POST", "guestlist_entries?select=id,guest_user_id,event_id,qr_secret", guests.map((g, i) => ({
    event_id: event.id, order_id: orders[i].id, guest_user_id: g.id, guest_email: g.email, guest_name: g.name,
    status: "approved", source: "request", can_chat: true, notes: "Paid ticket — General", created_by: g.id,
  })));
  await rest("PATCH", `ticket_tiers?id=eq.${tierGeneral.id}`, { sold: guests.length });
  await Promise.all(entries.map((e, i) => rest("PATCH", `ticket_orders?id=eq.${orders[i].id}`, { guestlist_entry_id: e.id })));
  const byUser = new Map(entries.map((e) => [e.guest_user_id, e]));
  const guestsWithTickets = guests.map((g) => {
    const e = byUser.get(g.id);
    const qr = Buffer.from(JSON.stringify({ eid: e.event_id, gid: e.id, sec: e.qr_secret })).toString("base64");
    return { ...g, entry_id: e.id, qr };
  });

  console.log("Sign-ins (this is itself a small auth load test)");
  const state = {
    target: cfg.url, run: cfg.run, created_at: new Date().toISOString(),
    event_id: event.id, tier_general_id: tierGeneral.id, tier_scarce_id: tierScarce.id,
    host: (await signInAll([host], "host"))[0],
    staff: await signInAll(staff, "staff"),
    guests: await signInAll(guestsWithTickets, "guest"),
    buyers: await signInAll(buyers, "buyer"),
  };
  saveState(state);
  console.log(`\nWrote out/state.json  event=${event.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
