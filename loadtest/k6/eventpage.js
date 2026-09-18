// Guests opening the event page (/event/:id) — every request EventDetails.jsx
// and EventChat.jsx make on load: the event, the guestlist view (RLS trims it
// to the guest's own rows), staff, tiers, chat history and the who's-going RPC.
// Driven as an arrival rate, as real guest sessions.
//
//   k6 run -e ARRIVALS=250 -e WINDOW=60 loadtest/k6/eventpage.js
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

const pageMs = new Trend("event_page_ms", true);
const entriesMs = new Trend("entries_view_ms", true);
const staffMs = new Trend("staff_ms", true);
const tiersMs = new Trend("tiers_ms", true);
const chatMs = new Trend("chat_history_ms", true);
const attendeesMs = new Trend("attendees_ms", true);

const EVENT_SELECT = "id,host_id,business_id,title,cover_image_url,date,start_time,end_time,timezone,venue_name,address,venue_lat,venue_lng,dress_code,description,entry_notes,instagram,is_public,discoverable,capacity,requests_open,plus_one_allowed,status,is_paid,currency,fee_mode,visibility,created_at,updated_at,host:profiles!events_host_id_fkey(id,email,full_name,avatar_url,instagram,snapchat),co_host_rows:event_co_hosts(id,email,status,user_id,profile:profiles(full_name,avatar_url))";
const MSG_SELECT = "id,event_id,sender_id,text,created_at,sender:profiles(id,email,full_name,avatar_url,instagram,snapchat),event:events(host_id)";

export const options = {
  scenarios: {
    arrivals: {
      executor: "constant-arrival-rate",
      rate: ARRIVALS, timeUnit: `${WINDOW}s`, duration: `${WINDOW}s`,
      preAllocatedVUs: Math.min(ARRIVALS, 100), maxVUs: ARRIVALS,
    },
  },
  thresholds: { http_req_failed: ["rate<0.01"], event_page_ms: ["p(95)<2000"] },
};

export default function () {
  const g = guests[(__VU * 7919 + __ITER) % guests.length];
  const h = { apikey: ANON, Authorization: `Bearer ${g.access_token}`, "Content-Type": "application/json" };
  const t0 = Date.now();
  const ev = http.get(`${BASE}/rest/v1/events?select=${encodeURIComponent(EVENT_SELECT)}&id=eq.${EVENT}`, { headers: h, tags: { name: "GET event" } });
  const batch = http.batch([
    ["GET", `${BASE}/rest/v1/guestlist_entries_view?select=*&event_id=eq.${EVENT}`, null, { headers: h, tags: { name: "GET entries view" } }],
    ["GET", `${BASE}/rest/v1/event_staff?select=*&event_id=eq.${EVENT}`, null, { headers: h, tags: { name: "GET staff" } }],
    ["GET", `${BASE}/rest/v1/ticket_tiers?select=*&event_id=eq.${EVENT}`, null, { headers: h, tags: { name: "GET tiers" } }],
    ["GET", `${BASE}/rest/v1/event_messages?select=${encodeURIComponent(MSG_SELECT)}&event_id=eq.${EVENT}&order=created_at.asc&limit=100`, null, { headers: h, tags: { name: "GET chat" } }],
    ["POST", `${BASE}/rest/v1/rpc/get_event_attendees`, JSON.stringify({ p_event_id: EVENT, p_offset: 0, p_limit: 50 }), { headers: h, tags: { name: "RPC attendees" } }],
  ]);
  pageMs.add(Date.now() - t0);
  entriesMs.add(batch[0].timings.duration); staffMs.add(batch[1].timings.duration);
  tiersMs.add(batch[2].timings.duration); chatMs.add(batch[3].timings.duration); attendeesMs.add(batch[4].timings.duration);
  check(ev, { "event 200": (r) => r.status === 200 && r.json().length === 1 });
  check(batch[0], { "entries 200 + own row": (r) => r.status === 200 && r.json().length >= 1 });
  check(batch[1], { "staff 200": (r) => r.status === 200 });
  check(batch[2], { "tiers 200": (r) => r.status === 200 });
  check(batch[3], { "chat 200": (r) => r.status === 200 });
  check(batch[4], { "attendees 200": (r) => r.status === 200 });
}
