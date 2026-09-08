// Target configuration for the load tests. Every script reads the same env:
//   LT_SUPABASE_URL   e.g. http://127.0.0.1:54321 or https://<ref>.supabase.co
//   LT_ANON_KEY       anon (publishable) key
//   LT_SERVICE_KEY    service-role key — setup/verify/cleanup only, never in k6
//   LT_RUN            short tag that prefixes every fixture email (default: lt)
// Local defaults come from `supabase status -o env`; see loadtest/README.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(here, "..", "out");
export const STATE_FILE = path.join(OUT_DIR, "state.json");

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export const cfg = {
  url: (process.env.LT_SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, ""),
  anon: process.env.LT_ANON_KEY || "",
  service: process.env.LT_SERVICE_KEY || "",
  run: process.env.LT_RUN || "lt",
  password: "LoadTest-Pass-123!",
  domain: "loadtest.doorman.dev",
};
cfg.rest = `${cfg.url}/rest/v1`;
cfg.auth = `${cfg.url}/auth/v1`;
cfg.functions = `${cfg.url}/functions/v1`;

export function requireKeys() {
  if (!cfg.anon) need("LT_ANON_KEY");
  if (!cfg.service) need("LT_SERVICE_KEY");
}

export function svcHeaders(extra = {}) {
  return {
    apikey: cfg.service,
    Authorization: `Bearer ${cfg.service}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function userHeaders(token, extra = {}) {
  return {
    apikey: cfg.anon,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function rest(method, pathAndQuery, body, headers = svcHeaders()) {
  const res = await fetch(`${cfg.rest}/${pathAndQuery}`, {
    method,
    headers: { Prefer: "return=representation", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${pathAndQuery} -> ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

export async function rpc(fn, args, headers = svcHeaders()) {
  const res = await fetch(`${cfg.rest}/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args ?? {}) });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Run `fn` over `items` with at most `limit` in flight.
export async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function loadState() {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

export function saveState(state) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
