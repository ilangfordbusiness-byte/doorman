import { base44 } from "@/api/base44Client";

const DOMAIN_KEY = "doorman_link_domain";

// Origin used in shareable promoter links. Defaults to the current origin
// (the live domain in production); hosts can override it from the Promoter panel.
export function getLinkDomain() {
  try {
    const stored = localStorage.getItem(DOMAIN_KEY);
    if (stored) return stored;
  } catch {}
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function setLinkDomain(raw) {
  let v = String(raw || "").trim();
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    if (!v) {
      localStorage.removeItem(DOMAIN_KEY);
      return window.location.origin;
    }
    const origin = new URL(v).origin;
    localStorage.setItem(DOMAIN_KEY, origin);
    return origin;
  } catch {
    return typeof window !== "undefined" ? window.location.origin : "";
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