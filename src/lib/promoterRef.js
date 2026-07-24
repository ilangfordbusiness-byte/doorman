import { base44 } from "@/api/base44Client";

const DOMAIN_KEY = "doorman_link_domain";

// The canonical live domain for shareable links. All promoter tracking links,
// event share links, ticket-sale QR codes, and checkout redirects use this so
// they resolve to the real app regardless of where the code is running (preview
// sandbox, staging, etc.). Hosts can still override it from the Promoter panel.
const DEFAULT_LINK_DOMAIN = "https://thedoorman.app";

export function getLinkDomain() {
  try {
    const stored = localStorage.getItem(DOMAIN_KEY);
    if (stored) return stored;
  } catch {}
  return DEFAULT_LINK_DOMAIN;
}

export function setLinkDomain(raw) {
  let v = String(raw || "").trim();
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    if (!v) {
      localStorage.removeItem(DOMAIN_KEY);
      return DEFAULT_LINK_DOMAIN;
    }
    const origin = new URL(v).origin;
    localStorage.setItem(DOMAIN_KEY, origin);
    return origin;
  } catch {
    return DEFAULT_LINK_DOMAIN;
  }
}

export function getStoredRef(eventId) {
  try {
    return localStorage.getItem(`promoter_ref_${eventId}`);
  } catch {
    return null;
  }
}

// Validate a ref code for an event, persist it for checkout attribution, and
// count a click once per browser session. Returns { valid, promoter }.
export async function captureRef(eventId, code) {
  if (!eventId || !code) return { valid: false };
  try {
    const promoters = await base44.entities.Promoter.filter({
      event_id: eventId,
      tracking_code: String(code).trim(),
    });
    const promoter = promoters[0];
    if (!promoter || promoter.status !== "active") return { valid: false };
    localStorage.setItem(`promoter_ref_${eventId}`, promoter.tracking_code);
    const clickKey = `doorman_click_${promoter.id}`;
    if (!sessionStorage.getItem(clickKey)) {
      sessionStorage.setItem(clickKey, "1");
      try {
        await base44.entities.Promoter.update(promoter.id, {
          clicks: Number(promoter.clicks || 0) + 1,
        });
      } catch {}
    }
    return { valid: true, promoter };
  } catch {
    return { valid: false };
  }
}