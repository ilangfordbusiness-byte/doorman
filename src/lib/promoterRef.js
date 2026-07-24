import { base44 } from "@/api/base44Client";

const DOMAIN_KEY = "doorman_link_domain";
const APP_DOMAIN = "https://thedoorman.app";

// Canonical domain for all shareable links (promoter tracking, event invites,
// ticket sales QR, checkout). Defaults to the connected custom domain; hosts can
// override it from the Promoter panel if needed.
export function getLinkDomain() {
  try {
    const stored = localStorage.getItem(DOMAIN_KEY);
    if (stored) return stored;
  } catch {}
  return APP_DOMAIN;
}

export function setLinkDomain(raw) {
  let v = String(raw || "").trim();
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    if (!v) {
      localStorage.removeItem(DOMAIN_KEY);
      return APP_DOMAIN;
    }
    const origin = new URL(v).origin;
    localStorage.setItem(DOMAIN_KEY, origin);
    return origin;
  } catch {
    return APP_DOMAIN;
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