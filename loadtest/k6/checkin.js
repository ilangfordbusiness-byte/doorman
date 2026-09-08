// Door check-in load: SCANNERS staff phones scanning distinct tickets as fast as
// the UI allows (validate, then check_in — the two calls the scanner page makes),
// followed by a double-scan race where two phones submit the same ticket at once.
//
//   k6 run -e SCANNERS=3 -e RACE=40 loadtest/k6/checkin.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

const state = JSON.parse(open("../out/state.json"));
const BASE = __ENV.LT_SUPABASE_URL || state.target;
const ANON = __ENV.LT_ANON_KEY;
const SCANNERS = Number(__ENV.SCANNERS || 3);
const RACE = Number(__ENV.RACE || 40);            // tickets reserved for the race phase
const THINK = Number(__ENV.THINK_MS || 300);      // ms between scans on one phone

const guests = new SharedArray("guests", () => state.guests);
const staff = new SharedArray("staff", () => state.staff);
const steadyPool = guests.length - RACE;

const checkinOk = new Counter("checkin_ok");
const checkinAlreadyUsed = new Counter("checkin_already_used");
const checkinRejected = new Counter("checkin_rejected");
const raceWins = new Counter("race_wins");
const raceLosses = new Counter("race_losses");
const validateLatency = new Trend("validate_ms", true);
const checkinLatency = new Trend("checkin_ms", true);

export const options = {
  scenarios: {
    steady: {
      executor: "per-vu-iterations", vus: SCANNERS,
      iterations: Math.floor(steadyPool / SCANNERS), maxDuration: "10m", exec: "steady",
    },
    race: {
      executor: "per-vu-iterations", vus: 2, iterations: RACE, maxDuration: "5m",
      exec: "race", startTime: "1s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checkin_ms: ["p(95)<1500"],
  },
};

function scan(token, qr, action) {
  const body = action ? { qr_data: qr, action } : { qr_data: qr };
  return http.post(`${BASE}/functions/v1/validateQR`, JSON.stringify(body), {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    tags: { name: action ? "validateQR:check_in" : "validateQR:validate" },
  });
}

export function steady() {
  const idx = exec.scenario.iterationInTest; // distinct ticket per iteration across all scanner VUs
  const vu = exec.vu.idInInstance;
  if (idx >= steadyPool) return;
  const token = staff[vu % staff.length].access_token;
  const qr = guests[idx].qr;

  const v = scan(token, qr);
  validateLatency.add(v.timings.duration);
  check(v, { "validate 200": (r) => r.status === 200, "validate valid": (r) => r.json("valid") === true });

  const c = scan(token, qr, "check_in");
  checkinLatency.add(c.timings.duration);
  const ok = check(c, { "check_in 200": (r) => r.status === 200 });
  if (v.status !== 200 || c.status !== 200) console.log(`non-200: validate ${v.status} ${String(v.body).slice(0, 120)} | check_in ${c.status} ${String(c.body).slice(0, 120)}`);
  const j = ok ? c.json() : {};
  if (j.checked_in) checkinOk.add(1);
  else if (j.already_used) checkinAlreadyUsed.add(1);
  else checkinRejected.add(1);
  if (THINK) sleep(THINK / 1000);
}

// Both race VUs walk the same tail of the pool; per ticket exactly one must win.
export function race() {
  const idx = steadyPool + __ITER;
  if (idx >= guests.length) return;
  const token = staff[(exec.vu.idInInstance + SCANNERS) % staff.length].access_token;
  const c = scan(token, guests[idx].qr, "check_in");
  checkinLatency.add(c.timings.duration);
  const j = c.status === 200 ? c.json() : {};
  if (j.checked_in) raceWins.add(1);
  else if (j.already_used) raceLosses.add(1);
  else checkinRejected.add(1);
}
