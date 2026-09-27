// Ticket-tier availability as the buyer sees it. A tier's seats are either
// sold, held by a checkout that is still in progress (`reserved`), or free;
// only the free ones can be bought right now.
export function tierRemaining(tier) {
  const quantity = Number(tier?.quantity || 0);
  const sold = Number(tier?.sold || 0);
  const reserved = Number(tier?.reserved || 0);
  return Math.max(0, quantity - sold - reserved);
}

export function tierSoldOut(tier) {
  return tier?.sales_status !== "open" || tierRemaining(tier) <= 0;
}

// A scheduled release: the host set `release_at` and it has not arrived yet.
// The tier is shown ("On sale from ...") but cannot be bought; the database
// (reserve_tier_seats) and createTicketCheckout enforce the same rule.
export function tierScheduled(tier) {
  const at = tier?.release_at;
  if (!at) return false;
  const ts = new Date(at).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

// Earliest upcoming release across a list of tiers, or null when none is scheduled.
export function nextTierRelease(tiers) {
  let best = null;
  for (const t of tiers || []) {
    if (!tierScheduled(t)) continue;
    const ts = new Date(t.release_at).getTime();
    if (best === null || ts < best) best = ts;
  }
  return best === null ? null : new Date(best);
}

// "Fri 3 Oct, 18:00" in the viewer's own zone.
export function formatReleaseAt(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

// <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM", browser-local time)
// for an ISO timestamp, or "" when unset.
export function releaseAtToLocalInput(at) {
  if (!at) return "";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local value -> ISO timestamp (interpreted in the browser's zone),
// or null when empty/invalid.
export function localInputToReleaseAt(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
