// Realtime chat fan-out: CLIENTS guests subscribe to the event's chat exactly
// as EventChat.jsx does (postgres_changes on event_messages, filtered by
// event_id, and a per-message refetch of the row with the sender join), then
// the host posts one message per SEND_MS for MESSAGES messages. Reports
// subscribe success, delivery rate, and delivery latency. Runs as real guest
// sessions so Realtime applies RLS per subscriber — the known scaling cost.
//
//   node loadtest/realtime.mjs [--clients 250] [--messages 30] [--send-ms 1000]
import { createClient } from "@supabase/supabase-js";
import { cfg, loadState, rest, userHeaders, pct } from "./lib/env.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith("--") ? [a.slice(2), all[i + 1]] : []).filter(Boolean));
const CLIENTS = Number(args.clients || 250);
const MESSAGES = Number(args.messages || 30);
const SEND_MS = Number(args["send-ms"] || 1000);
const REFETCH = args.refetch !== "0";

const state = loadState();
const EVENT = state.event_id;
const guests = state.guests.slice(0, CLIENTS);
const MSG_SELECT = "id,event_id,sender_id,text,created_at,sender:profiles(id,email,full_name,avatar_url,instagram,snapchat),event:events(host_id)";

const latencies = [];       // ms from insert to client callback
const perMessage = {};      // message index -> clients that received it
const refetchMs = [];
let received = 0, refetchErrors = 0;
const errorKinds = {};
const subscribed = [];      // per-client status

function makeClient(g, i) {
  const c = createClient(cfg.url, cfg.anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${g.access_token}` } },
  });
  c.realtime.setAuth(g.access_token);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ch = c.channel(`lt-chat-${i}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${EVENT}` }, async (payload) => {
        const sentAt = Number(String(payload.new.text).split("|")[1]);
        const mi = String(payload.new.text).split("|")[0]; perMessage[mi] = (perMessage[mi] || 0) + 1;
        latencies.push(Date.now() - sentAt);
        received++;
        if (REFETCH) {
          const s = Date.now();
          try {
            await rest("GET", `event_messages?select=${encodeURIComponent(MSG_SELECT)}&id=eq.${payload.new.id}`, undefined, userHeaders(g.access_token));
            refetchMs.push(Date.now() - s);
          } catch (e) { refetchErrors++; const k = String(e.message).slice(0, 80); errorKinds[k] = (errorKinds[k] || 0) + 1; }
        }
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") { subscribed[i] = { ok: true, ms: Date.now() - t0 }; resolve(c); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!subscribed[i]) { subscribed[i] = { ok: false, status, err: err?.message }; resolve(c); }
        }
      });
    setTimeout(() => { if (!subscribed[i]) { subscribed[i] = { ok: false, status: "no status in 20s" }; resolve(c); } }, 20000);
  });
}

async function main() {
  console.log(`Target ${cfg.url}  clients=${CLIENTS} messages=${MESSAGES} every ${SEND_MS} ms  refetch=${REFETCH}`);
  const t0 = Date.now();
  const clients = [];
  for (let i = 0; i < guests.length; i += 25) {           // connect in waves of 25
    clients.push(...await Promise.all(guests.slice(i, i + 25).map((g, j) => makeClient(g, i + j))));
  }
  const okSubs = subscribed.filter((s) => s?.ok);
  const subMs = okSubs.map((s) => s.ms).sort((a, b) => a - b);
  console.log(`Subscribed ${okSubs.length}/${CLIENTS} in ${Date.now() - t0} ms (subscribe p50 ${pct(subMs, 50)} ms, p95 ${pct(subMs, 95)} ms, max ${pct(subMs, 100)} ms)`);
  const failures = subscribed.filter((s) => !s?.ok);
  if (failures.length) console.log("  failures:", JSON.stringify(failures.slice(0, 5)));

  await new Promise((r) => setTimeout(r, 1500));
  console.log(`Host sending ${MESSAGES} messages…`);
  const sendMs = [];
  for (let m = 0; m < MESSAGES; m++) {
    const s = Date.now();
    await rest("POST", "event_messages", { event_id: EVENT, sender_id: state.host.id, text: `lt message ${m}|${s}` }, userHeaders(state.host.access_token));
    sendMs.push(Date.now() - s);
    await new Promise((r) => setTimeout(r, SEND_MS));
  }
  await new Promise((r) => setTimeout(r, 5000));         // drain

  const expected = okSubs.length * MESSAGES;
  latencies.sort((a, b) => a - b); refetchMs.sort((a, b) => a - b); sendMs.sort((a, b) => a - b);
  console.log(`\nDelivered ${received}/${expected} (${(100 * received / expected).toFixed(1)}%)`);
  const pm = Object.entries(perMessage).sort((a, b) => Number(a[0].split(" ").pop()) - Number(b[0].split(" ").pop())).map(([, n]) => n);
  console.log(`Per-message reach (clients that got msg 0..${MESSAGES - 1}): ${pm.join(" ")}`);
  console.log(`Delivery latency ms: p50 ${pct(latencies, 50)}  p95 ${pct(latencies, 95)}  p99 ${pct(latencies, 99)}  max ${pct(latencies, 100)}`);
  console.log(`Host insert ms:      p50 ${pct(sendMs, 50)}  max ${pct(sendMs, 100)}`);
  if (REFETCH) console.log(`Per-client refetch ms: p50 ${pct(refetchMs, 50)}  p95 ${pct(refetchMs, 95)}  max ${pct(refetchMs, 100)}  errors ${refetchErrors}  (${refetchMs.length} reads)`);
  if (refetchErrors) console.log("Refetch error kinds:", JSON.stringify(errorKinds));
  await Promise.all(clients.map((c) => c.removeAllChannels()));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
