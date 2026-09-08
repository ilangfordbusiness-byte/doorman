// Guests opening their QR pass at the door: every request the /pass/:id page
// makes (event, own entries, QR payload RPC, pending transfer) plus the Guest
// Hub dashboard RPC, driven as an arrival rate so ARRIVALS guests open the pass
// within WINDOW seconds. Runs as each guest's own session (RLS applies).
//
//   k6 run -e ARRIVALS=250 -e WINDOW=60 loadtest/k6/guestpass.js
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const state = JSON.parse(open("../out/state.json"));
const BASE = __ENV.LT_SUPABASE_URL || state.target;
const ANON = __ENV.LT_ANON_KEY;
const ARRIVALS = Number(__ENV.ARRIVALS || 250);
const WINDOW = Number(__ENV.WINDOW || 60);
const guests = new SharedArray("guests", () => state.guests);
const EVENT = state.event_id;

const passTotal = new Trend("pass_page_ms", true);
const qrRpc = new Trend("qr_payload_ms", true);
const hub = new Trend("guest_hub_ms", true);
const evMs = new Trend("get_event_ms", true);
const entriesMs = new Trend("get_my_entries_ms", true);
const transfersMs = new Trend("get_transfer_ms", true);

const EVENT_SELECT = "id,host_id,business_id,title,cover_image_url,date,start_time,end_time,venue_name,address,venue_lat,venue_lng,dress_code,description,entry_notes,instagram,is_public,discoverable,capacity,requests_open,plus_one_allowed,status,is_paid,currency,fee_mode,visibility,created_at,updated_at,host:profiles!events_host_id_fkey(id,email,full_name,avatar_url,instagram,snapchat),co_host_rows:event_co_hosts(id,email,status,user_id,profile:profiles(full_name,avatar_url))";

export const options = {
  scenarios: {
    arrivals: {
      executor: "constant-arrival-rate",
      rate: ARRIVALS, timeUnit: `${WINDOW}s`, duration: `${WINDOW}s`,
      preAllocatedVUs: Math.min(ARRIVALS, 100), maxVUs: ARRIVALS,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    pass_page_ms: ["p(95)<2000"],
  },
};

let counter = 0;
export default function () {
  const g = guests[(__VU * 7919 + __ITER) % guests.length];
  const h = { apikey: ANON, Authorization: `Bearer ${g.access_token}`, "Content-Type": "application/json", "Accept-Profile": "public" };
  const t0 = Date.now();

  const ev = http.get(`${BASE}/rest/v1/events?select=${encodeURIComponent(EVENT_SELECT)}&id=eq.${EVENT}`, { headers: h, tags: { name: "GET events" } });
  const entries = http.get(`${BASE}/rest/v1/guestlist_entries_view?select=*&event_id=eq.${EVENT}&guest_email=eq.${encodeURIComponent(g.email)}`, { headers: h, tags: { name: "GET my entries" } });
  const qr = http.post(`${BASE}/rest/v1/rpc/my_qr_payload`, JSON.stringify({ p_entry_id: g.entry_id }), { headers: h, tags: { name: "RPC my_qr_payload" } });
  qrRpc.add(qr.timings.duration);
  const transfers = http.get(`${BASE}/rest/v1/ticket_transfers?select=*&guestlist_entry_id=eq.${g.entry_id}&status=eq.pending`, { headers: h, tags: { name: "GET pending transfer" } });
  evMs.add(ev.timings.duration); entriesMs.add(entries.timings.duration); transfersMs.add(transfers.timings.duration);
  passTotal.add(Date.now() - t0);

  const dash = http.post(`${BASE}/rest/v1/rpc/get_guest_dashboard`, "{}", { headers: h, tags: { name: "RPC get_guest_dashboard" } });
  hub.add(dash.timings.duration);

  check(ev, { "event 200": (r) => r.status === 200 && r.json().length === 1 });
  check(entries, { "entries 200": (r) => r.status === 200 && r.json().length >= 1 });
  check(qr, { "qr 200": (r) => r.status === 200 && String(r.body).length > 20 });
  check(transfers, { "transfers 200": (r) => r.status === 200 });
  check(dash, { "hub 200": (r) => r.status === 200 });
}
