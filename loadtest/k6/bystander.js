// Latency probe for people NOT in the hot path: someone loading the Home page
// (get_home_dashboard) and an event page (event + attendees RPC) every second.
// Run it alongside another scenario to see whether that scenario slows the
// site down for everyone else. Numbers are only meaningful next to a baseline
// run of this script alone.
//
//   k6 run -e DURATION=60s loadtest/k6/bystander.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const state = JSON.parse(open("../out/state.json"));
const BASE = __ENV.LT_SUPABASE_URL || state.target;
const ANON = __ENV.LT_ANON_KEY;
const guests = new SharedArray("guests", () => state.guests);
const EVENT = state.event_id;

const home = new Trend("bystander_home_ms", true);
const attendees = new Trend("bystander_attendees_ms", true);

export const options = {
  scenarios: { probe: { executor: "constant-vus", vus: Number(__ENV.VUS || 3), duration: __ENV.DURATION || "60s" } },
};

export default function () {
  const g = guests[(guests.length - 1 - __VU) % guests.length];
  const h = { apikey: ANON, Authorization: `Bearer ${g.access_token}`, "Content-Type": "application/json" };
  const r1 = http.post(`${BASE}/rest/v1/rpc/get_home_dashboard`, "{}", { headers: h, tags: { name: "RPC get_home_dashboard" } });
  home.add(r1.timings.duration);
  const r2 = http.post(`${BASE}/rest/v1/rpc/get_event_attendees`, JSON.stringify({ p_event_id: EVENT, p_offset: 0, p_limit: 10 }), { headers: h, tags: { name: "RPC get_event_attendees" } });
  attendees.add(r2.timings.duration);
  check(r1, { "home 200": (r) => r.status === 200 });
  check(r2, { "attendees 200": (r) => r.status === 200 });
  sleep(1);
}
