// QR pass integrity: mints every guest's QR payload the way the pass page does
// (my_qr_payload as the guest), proves it matches the ticket in the database,
// and drives it through validateQR as door staff. Three phases:
//
//   --phase pre     before check-in: every ticket validates exactly as issued
//   --phase post    after the k6 check-in run: every ticket is rejected as used,
//                   and a second check_in cannot flip it again
//   --phase extra   forgery / tamper / wrong-event / unauthorized-scanner /
//                   bad-status / transfer / 5-way race / multi-ticket order,
//                   on extra fixtures so the main 250 tickets are untouched
//
//   node loadtest/qr_integrity.mjs --phase pre
import crypto from "node:crypto";
import { cfg, requireKeys, svcHeaders, userHeaders, rest, rpc, pmap, loadState, pct } from "./lib/env.mjs";

requireKeys();
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1]] : []).filter(Boolean));
const PHASE = args.phase || "pre";
const st = loadState();
const E = st.event_id;
let bad = 0, good = 0;
const fail = (m) => { bad++; console.log(`  FAIL ${m}`); };
const ok = (m) => { good++; console.log(`  ok   ${m}`); };
const expect = (cond, m) => (cond ? ok(m) : fail(m));

async function fn(name, token, body, extraHeaders = {}) {
  const headers = token ? userHeaders(token, extraHeaders) : { apikey: cfg.anon, "Content-Type": "application/json", ...extraHeaders };
  const res = await fetch(`${cfg.functions}/${name}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
const scan = (token, qr, action) => fn("validateQR", token, action ? { qr_data: qr, action } : { qr_data: qr });
const mint = (token, entryId) => rpc("my_qr_payload", { p_entry_id: entryId }, userHeaders(token));
const decode = (qr) => JSON.parse(Buffer.from(qr, "base64").toString("utf8"));
const staffTok = (i) => st.staff[i % st.staff.length].access_token;

async function phasePre() {
  console.log(`PRE: ${st.guests.length} guests mint + validate (no check-in)`);
  const mintMs = [], valMs = [];
  const payloads = new Set(), secrets = new Set();
  let mismatch = 0, shape = 0, valid = 0, notValid = 0, nameBad = 0, errs = 0;
  await pmap(st.guests, 16, async (g, i) => {
    let qr;
    try { const s = Date.now(); qr = await mint(g.access_token, g.entry_id); mintMs.push(Date.now() - s); } catch (e) { errs++; return; }
    let p; try { p = decode(qr); } catch { shape++; return; }
    // The RPC (json_build_object) and the ticket email (JSON.stringify) space
    // the JSON differently, so compare content, not bytes: the scanner parses.
    if (JSON.stringify(p) !== JSON.stringify(decode(g.qr))) mismatch++;
    if (p.eid !== E || p.gid !== g.entry_id || !/^[0-9a-f]{32}$/.test(String(p.sec))) shape++;
    payloads.add(qr); secrets.add(p.sec);
    const s = Date.now();
    const r = await scan(staffTok(i), qr);
    valMs.push(Date.now() - s);
    if (r.status === 200 && r.json.valid === true && r.json.checked_in === false && r.json.status === "approved") valid++;
    else { notValid++; if (notValid <= 3) console.log(`    not valid: ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`); }
    if (r.json.guest_name !== g.name) nameBad++;
  });
  expect(errs === 0, `${st.guests.length - errs}/${st.guests.length} payloads minted by the pass page RPC`);
  expect(mismatch === 0, `minted payload identifies the same ticket + secret as the DB row (${mismatch} mismatches)`);
  expect(shape === 0, `payload shape {eid,gid,sec(32 hex)} correct for all (${shape} bad)`);
  expect(payloads.size === st.guests.length && secrets.size === st.guests.length, `all ${st.guests.length} payloads and secrets unique (${payloads.size}/${secrets.size})`);
  expect(valid === st.guests.length, `${valid}/${st.guests.length} validate as approved, not yet checked in`);
  expect(nameBad === 0, `scanner shows the right guest name (${nameBad} wrong)`);
  mintMs.sort((a, b) => a - b); valMs.sort((a, b) => a - b);
  console.log(`  mint ms p50 ${pct(mintMs, 50)} p95 ${pct(mintMs, 95)} max ${pct(mintMs, 100)} | validate ms p50 ${pct(valMs, 50)} p95 ${pct(valMs, 95)} max ${pct(valMs, 100)}`);
  // Cross-guest: guest 1 asking for guest 2's payload must fail.
  let leaked = false;
  try { await mint(st.guests[0].access_token, st.guests[1].entry_id); leaked = true; } catch {}
  expect(!leaked, "a guest cannot mint another guest's QR payload");
}

async function phasePost() {
  console.log(`POST: ${st.guests.length} tickets re-scanned after check-in`);
  let used = 0, flipped = 0, other = 0, usedAgain = 0;
  await pmap(st.guests, 16, async (g, i) => {
    const v = await scan(staffTok(i), g.qr);
    if (v.status === 200 && v.json.already_used === true && v.json.valid === false && v.json.checked_in_at) used++;
    else { other++; if (other <= 3) console.log(`    unexpected: ${v.status} ${JSON.stringify(v.json).slice(0, 160)}`); }
    const c = await scan(staffTok(i + 7), g.qr, "check_in");
    if (c.json.checked_in === true) flipped++;
    else if (c.json.already_used === true) usedAgain++;
  });
  expect(used === st.guests.length, `${used}/${st.guests.length} rejected as already used, with the original check-in time`);
  expect(flipped === 0 && usedAgain === st.guests.length, `second check_in never succeeds (${flipped} flipped, ${usedAgain} refused)`);
  const rows = await rest("GET", `guestlist_entries?select=id,status,checked_in_at,checked_in_by&event_id=eq.${E}&order_id=not.is.null&limit=10000`);
  const ci = rows.filter((r) => r.status === "checked_in" && r.checked_in_at && r.checked_in_by);
  expect(ci.length === rows.length, `DB: ${ci.length}/${rows.length} ticketed entries checked_in with time + scanner id`);
  const byScanner = {}; for (const r of ci) byScanner[r.checked_in_by] = (byScanner[r.checked_in_by] || 0) + 1;
  console.log(`  check-ins attributed to ${Object.keys(byScanner).length} distinct scanner accounts`);
}

async function mkEntry(fields) {
  const [e] = await rest("POST", "guestlist_entries?select=id,event_id,qr_secret,status", { event_id: E, status: "approved", source: "request", can_chat: true, ...fields });
  return { ...e, qr: Buffer.from(JSON.stringify({ eid: e.event_id, gid: e.id, sec: e.qr_secret })).toString("base64") };
}

function signedWebhook(orderId, sessionId, secret) {
  const payload = JSON.stringify({ id: `evt_${sessionId}`, object: "event", type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", payment_intent: `pi_qr_${orderId}`, payment_status: "paid", metadata: { order_id: orderId } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return { payload, headers: { "Content-Type": "application/json", "stripe-signature": `t=${t},v1=${sig}` } };
}

async function phaseExtra() {
  console.log("EXTRA: forgery, wrong event, bad status, unauthorized scanners, transfer, race, multi-ticket");
  const b = st.buyers, s0 = staffTok(0);
  const g0 = st.guests[0];

  // Second event (same host, no staff) with a ticket for guest 0.
  const [e2] = await rest("POST", "events", { host_id: st.host.id, title: `LOADTEST ${cfg.run} second event`, date: new Date(Date.now() + 14 * 86400e3).toISOString().slice(0, 10), start_time: "20:00", end_time: "23:00", venue_name: "Elsewhere", address: "2 Other St", status: "published", is_public: true, discoverable: false, requests_open: true, is_paid: false, currency: "gbp", visibility: "show_names", capacity: 50 });
  const [x2] = await rest("POST", "guestlist_entries?select=id,event_id,qr_secret", { event_id: e2.id, guest_user_id: g0.id, guest_email: g0.email, guest_name: g0.name, status: "approved", source: "request", created_by: g0.id });
  const qrE2 = Buffer.from(JSON.stringify({ eid: e2.id, gid: x2.id, sec: x2.qr_secret })).toString("base64");

  // --- Forgery / tamper -----------------------------------------------------
  const p = decode(g0.qr);
  const tampered = Buffer.from(JSON.stringify({ ...p, sec: (p.sec[0] === "a" ? "b" : "a") + p.sec.slice(1) })).toString("base64");
  let r = await scan(s0, tampered);
  expect(r.json.valid === false && /forgery|invalid/i.test(r.json.error || ""), `tampered secret rejected: "${r.json.error}"`);
  r = await scan(s0, tampered, "check_in");
  expect(r.json.valid === false && r.json.checked_in !== true, "tampered secret cannot check in");
  const [row0] = await rest("GET", `guestlist_entries?select=status&id=eq.${g0.entry_id}`);
  expect(row0.status === "approved", "ticket untouched after tamper attempts");
  r = await scan(s0, Buffer.from(JSON.stringify({ ...p, eid: e2.id })).toString("base64"));
  expect(r.json.valid === false && /different event/i.test(r.json.error || ""), `event id swapped -> "${r.json.error}"`);
  r = await scan(s0, "not!!base64@@");
  expect(r.json.valid === false && /format/i.test(r.json.error || ""), `garbage -> "${r.json.error}"`);
  r = await scan(s0, Buffer.from("{}").toString("base64"));
  expect(r.json.valid === false && /incomplete/i.test(r.json.error || ""), `empty payload -> "${r.json.error}"`);
  r = await scan(s0, Buffer.from(JSON.stringify({ ...p, gid: crypto.randomUUID() })).toString("base64"));
  expect(r.json.valid === false && /not found/i.test(r.json.error || ""), `unknown ticket id -> "${r.json.error}"`);
  r = await scan(s0, "");
  expect(r.json.valid === false, `empty qr_data -> "${r.json.error}"`);

  // --- Who may scan ---------------------------------------------------------
  r = await scan(null, g0.qr);
  expect(r.status === 401, `no session -> ${r.status}`);
  r = await scan(st.guests[5].access_token, st.guests[6].qr);
  expect(r.status === 403, `a guest scanning another guest -> ${r.status} "${r.json.error}"`);
  r = await scan(b[5].access_token, g0.qr);
  expect(r.status === 403, `an account with no role -> ${r.status}`);
  r = await scan(s0, qrE2);
  expect(r.status === 403, `staff of this event scanning a ticket for another event -> ${r.status}`);
  r = await scan(st.host.access_token, qrE2);
  expect(r.json.valid === true, "the host of that other event can validate it");
  r = await scan(st.host.access_token, g0.qr);
  expect(r.json.valid === true, "the host can validate tickets for the main event");

  // --- Entry status gates ---------------------------------------------------
  for (const status of ["requested", "waitlist", "denied", "revoked"]) {
    let x;
    try { x = await mkEntry({ guest_user_id: b[0].id, guest_email: b[0].email, guest_name: `${b[0].name} ${status}`, status, created_by: b[0].id }); }
    catch (e) { console.log(`  (status '${status}' not allowed by schema: ${String(e.message).slice(0, 80)})`); continue; }
    const v = await scan(s0, x.qr, "check_in");
    const [after] = await rest("GET", `guestlist_entries?select=status&id=eq.${x.id}`);
    expect(v.json.valid === false && v.json.checked_in !== true && after.status === status, `status '${status}' cannot check in -> "${v.json.error}"`);
  }

  // --- Transfer rotates the secret ----------------------------------------
  const from = b[2], to = b[4];
  const xt = await mkEntry({ guest_user_id: from.id, guest_email: from.email, guest_name: from.name, created_by: from.id });
  const oldQr = await mint(from.access_token, xt.id);
  expect(decode(oldQr).sec === decode(xt.qr).sec, "transfer source can mint its QR");
  r = await fn("initiateTicketTransfer", from.access_token, { guestlist_entry_id: xt.id, recipient_email: to.email, recipient_name: to.name });
  expect(r.status === 200 && r.json.ok, `initiateTicketTransfer -> ${r.status} ${r.json.error || "ok"}`);
  const transferId = r.json.transfer?.id;
  r = await scan(s0, oldQr);
  console.log(`  (while pending: old QR validate -> valid=${r.json.valid}; sender still holds the ticket until accepted)`);
  r = await fn("acceptTicketTransfer", to.access_token, { transfer_id: transferId });
  expect(r.status === 200 && r.json.ok, `acceptTicketTransfer -> ${r.status} ${r.json.error || "ok"}`);
  r = await scan(s0, oldQr);
  expect(r.json.valid === false && /forgery|invalid/i.test(r.json.error || ""), `sender's old QR (screenshot) rejected after transfer: "${r.json.error}"`);
  r = await scan(s0, oldQr, "check_in");
  expect(r.json.checked_in !== true, "sender's old QR cannot check in");
  let senderMint = null; try { senderMint = await mint(from.access_token, xt.id); } catch {}
  expect(senderMint === null, "sender can no longer mint a payload for the transferred ticket");
  const newQr = await mint(to.access_token, xt.id);
  expect(newQr !== oldQr && decode(newQr).sec !== decode(oldQr).sec, "recipient gets a new secret");
  r = await scan(s0, newQr);
  expect(r.json.valid === true && r.json.guest_name === to.name, `recipient's QR validates under their name (${r.json.guest_name})`);
  r = await scan(s0, newQr, "check_in");
  expect(r.json.checked_in === true, "recipient's QR checks in");
  r = await scan(s0, newQr, "check_in");
  expect(r.json.already_used === true, "…and only once");
  r = await fn("initiateTicketTransfer", to.access_token, { guestlist_entry_id: xt.id, recipient_email: b[7].email });
  expect(r.status !== 200, `a used ticket cannot be transferred (${r.status}: ${r.json.error})`);

  // --- 5 phones, one ticket, same instant -----------------------------------
  const xr = await mkEntry({ guest_user_id: b[3].id, guest_email: b[3].email, guest_name: b[3].name, created_by: b[3].id });
  const results = await Promise.all([0, 1, 2, 3, 4].map((i) => scan(staffTok(i + 10), xr.qr, "check_in")));
  const wins = results.filter((x) => x.json.checked_in === true).length;
  const losses = results.filter((x) => x.json.already_used === true).length;
  expect(wins === 1 && losses === 4, `5 simultaneous check-ins of one ticket: ${wins} win, ${losses} refused`);
  const [xrRow] = await rest("GET", `guestlist_entries?select=status,checked_in_by&id=eq.${xr.id}`);
  const winner = results.findIndex((x) => x.json.checked_in === true);
  expect(xrRow.status === "checked_in" && xrRow.checked_in_by === st.staff[(winner + 10) % st.staff.length].id, "DB credits the one scanner that won");

  // --- Real fulfilment path: 2-ticket order via checkout + duplicate webhooks
  const secret = process.env.LT_WEBHOOK_SECRET;
  if (!secret) { console.log("  (LT_WEBHOOK_SECRET unset: skipping multi-ticket checkout)"); }
  else {
    const buyer = b[6];
    r = await fn("createTicketCheckout", buyer.access_token, { tier_id: st.tier_general_id, quantity: 2, success_url: `${cfg.url}/x`, cancel_url: `${cfg.url}/y` });
    expect(r.status === 200 && r.json.order_id, `createTicketCheckout qty 2 -> ${r.status} ${r.json.error || "ok"}`);
    if (r.json.order_id) {
      const w = signedWebhook(r.json.order_id, `cs_test_${cfg.run}_multi_${r.json.order_id}`, secret);
      const deliver = () => fetch(`${cfg.functions}/ticketWebhook`, { method: "POST", headers: w.headers, body: w.payload }).then((x) => x.status);
      const codes = await Promise.all([deliver(), deliver(), deliver()]);
      expect(codes.every((c) => c === 200), `3 concurrent webhook deliveries all 200 (${codes.join(",")})`);
      const ents = await rest("GET", `guestlist_entries?select=id,event_id,qr_secret,status,guest_name&order_id=eq.${r.json.order_id}`);
      expect(ents.length === 2, `exactly 2 tickets issued for the 2-seat order (${ents.length})`);
      expect(new Set(ents.map((e) => e.qr_secret)).size === ents.length, "each ticket has its own secret");
      let once = 0, twice = 0;
      for (const e of ents) {
        const qr = await mint(buyer.access_token, e.id);
        const c1 = await scan(s0, qr, "check_in"); if (c1.json.checked_in === true) once++;
        const c2 = await scan(staffTok(3), qr, "check_in"); if (c2.json.already_used === true) twice++;
      }
      expect(once === ents.length && twice === ents.length, `each of the ${ents.length} tickets scans once then is refused (${once}/${twice})`);
      const [ord] = await rest("GET", `ticket_orders?select=status,quantity&id=eq.${r.json.order_id}`);
      expect(ord.status === "paid", `order marked paid once (${ord.status})`);
    }
  }
}

const phases = { pre: phasePre, post: phasePost, extra: phaseExtra };
if (!phases[PHASE]) { console.error(`unknown phase ${PHASE}`); process.exit(2); }
await phases[PHASE]();
console.log(`\n${PHASE}: ${good} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
