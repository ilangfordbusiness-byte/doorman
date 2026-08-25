import { api } from "@/api/data";

// Module-level cache of live profile pictures keyed by lowercased email.
// Shared across all UserAvatar instances so each user's picture is fetched
// at most once per session and stays current (read straight from the User
// entity via getProfiles), instead of relying on denormalized snapshots that
// go stale when the person later sets or changes their photo.
const cache = new Map(); // email -> picture url ("" when fetched-but-empty)
const subscribers = new Set();
const queue = new Set();
let scheduled = false;

function notify() {
  subscribers.forEach((cb) => cb());
}

function scheduleFlush() {
  if (scheduled) return;
  scheduled = true;
  Promise.resolve().then(() => {
    scheduled = false;
    flush();
  });
}

async function flush() {
  const emails = Array.from(queue).filter((e) => !cache.has(e));
  queue.clear();
  if (!emails.length) return;
  // Mark pending so we don't refetch the same email before the first
  // response arrives.
  emails.forEach((e) => { if (!cache.has(e)) cache.set(e, ""); });
  try {
    const res = await api.functions.invoke("getProfiles", { emails });
    const profiles = res.data?.profiles || {};
    for (const [email, p] of Object.entries(profiles)) {
      cache.set(email, p.picture || "");
    }
    notify();
  } catch (e) {
    // Leave entries as "" so we don't retry forever on hard failures.
    notify();
  }
}

export function requestPictures(emails) {
  for (const raw of emails || []) {
    if (!raw) continue;
    const e = String(raw).toLowerCase();
    if (!cache.has(e)) queue.add(e);
  }
  scheduleFlush();
}

export function getPicture(email) {
  if (!email) return "";
  return cache.get(String(email).toLowerCase()) || "";
}

export function subscribe(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}