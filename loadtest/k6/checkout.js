// Ticket purchase burst: BUYERS people hit "Buy" within WINDOW seconds. Each
// iteration calls createTicketCheckout (a real Stripe test-mode session is
// created), then simulates Stripe delivering checkout.session.completed to
// ticketWebhook TWICE concurrently (Stripe retries/duplicates), signed with
// the webhook secret. Set TIER=scarce to aim everyone at the 20-seat tier and
// watch what happens past capacity.
//
//   LT_WEBHOOK_SECRET=whsec_... k6 run -e BUYERS=60 -e WINDOW=10 -e TIER=general loadtest/k6/checkout.js
import http from "k6/http";
import { check } from "k6";
import crypto from "k6/crypto";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const state = JSON.parse(open("../out/state.json"));
const BASE = __ENV.LT_SUPABASE_URL || state.target;
const ANON = __ENV.LT_ANON_KEY;
const SECRET = __ENV.LT_WEBHOOK_SECRET;
const BUYERS = Number(__ENV.BUYERS || state.buyers.length);
const WINDOW = Number(__ENV.WINDOW || 10);
const TIER = (__ENV.TIER || "general") === "scarce" ? state.tier_scarce_id : state.tier_general_id;
const SKIP_WEBHOOK = __ENV.SKIP_WEBHOOK === "1";
const buyers = new SharedArray("buyers", () => state.buyers);

const checkoutOk = new Counter("checkout_ok");
const checkoutSoldOut = new Counter("checkout_sold_out");
const checkoutFailed = new Counter("checkout_failed");
const webhookOk = new Counter("webhook_ok");
const checkoutMs = new Trend("checkout_ms", true);
const webhookMs = new Trend("webhook_ms", true);

export const options = {
  scenarios: {
    burst: {
      executor: "constant-arrival-rate",
      rate: BUYERS, timeUnit: `${WINDOW}s`, duration: `${WINDOW}s`,
      preAllocatedVUs: Math.min(BUYERS, 50), maxVUs: BUYERS,
    },
  },
  thresholds: { checkout_ms: ["p(95)<4000"] },
};

function signedWebhook(orderId, sessionId) {
  const payload = JSON.stringify({
    id: `evt_${sessionId}`, object: "event", type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", payment_intent: `pi_lt_${orderId}`, payment_status: "paid", metadata: { order_id: orderId } } },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.hmac("sha256", SECRET, `${t}.${payload}`, "hex");
  return { payload, headers: { "Content-Type": "application/json", "stripe-signature": `t=${t},v1=${sig}` } };
}

export default function () {
  const b = buyers[(__VU * 31 + __ITER) % buyers.length];
  const h = { apikey: ANON, Authorization: `Bearer ${b.access_token}`, "Content-Type": "application/json" };
  const res = http.post(`${BASE}/functions/v1/createTicketCheckout`,
    JSON.stringify({ tier_id: TIER, quantity: 1, success_url: `${BASE}/x`, cancel_url: `${BASE}/y` }),
    { headers: h, tags: { name: "createTicketCheckout" } });
  checkoutMs.add(res.timings.duration);
  let j = {};
  try { j = res.json(); } catch { j = {}; }
  if (res.status === 200 && j.url) checkoutOk.add(1);
  else if (/sold out/i.test(j.error || "")) { checkoutSoldOut.add(1); return; }
  else { checkoutFailed.add(1); console.log(`checkout ${res.status}: ${String(res.body).slice(0, 200)}`); return; }
  check(res, { "checkout 200": (r) => r.status === 200 });
  if (SKIP_WEBHOOK || !SECRET) return;

  // Stripe fulfils via webhook; deliver it twice at once (duplicate delivery).
  const sessionId = `cs_test_lt_${j.order_id}`;
  const w = signedWebhook(j.order_id, sessionId);
  const [r1, r2] = http.batch([
    ["POST", `${BASE}/functions/v1/ticketWebhook`, w.payload, { headers: w.headers, tags: { name: "ticketWebhook" } }],
    ["POST", `${BASE}/functions/v1/ticketWebhook`, w.payload, { headers: w.headers, tags: { name: "ticketWebhook" } }],
  ]);
  webhookMs.add(r1.timings.duration); webhookMs.add(r2.timings.duration);
  if (r1.status === 200) webhookOk.add(1);
  if (r2.status === 200) webhookOk.add(1);
  check(r1, { "webhook 200": (r) => r.status === 200 });
}
