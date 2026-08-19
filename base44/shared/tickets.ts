// Shared ticket pricing helpers used by createTicketCheckout and ticketWebhook.
// Platform fee: fixed 0.50 + 4% of the discounted amount the guest actually pays.

export const PLATFORM_FEE_FIXED_MINOR = 50; // 0.50 in the currency's minor units
export const PLATFORM_FEE_PERCENT = 0.04; // 4%
export const MIN_PAID_MINOR = 50; // minimum chargeable amount (platform minimum fee floor)

export function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

export function toMajor(minor) {
  return Number(minor) / 100;
}

export function computeFeeMinor(paidMinor) {
  return PLATFORM_FEE_FIXED_MINOR + Math.round(PLATFORM_FEE_PERCENT * paidMinor);
}

// Apply a percentage discount and floor the result at the platform minimum.
export function applyDiscount(unitMinor, discountPercent) {
  const discount = Math.round(unitMinor * (Number(discountPercent) / 100));
  let paid = unitMinor - discount;
  if (paid < 0) paid = 0;
  if (paid < MIN_PAID_MINOR) paid = MIN_PAID_MINOR;
  return { discount, paid };
}

// Whether the promoter's auto-discount is configured and still has uses
// remaining. max_uses = 0 means unlimited.
export function promoterDiscountAvailable(promoter) {
  if (!promoter) return false;
  const type = promoter.discount_type;
  if (!type || type === 'none' || Number(promoter.discount_value || 0) <= 0) return false;
  const maxUses = Number(promoter.discount_max_uses || 0);
  if (maxUses === 0) return true;
  return Number(promoter.discount_used_count || 0) < maxUses;
}

// Compute the promoter discount amount (minor units) for a ticket face value.
// Returns 0 if the promoter has no discount configured. Does not floor the paid
// amount — the caller combines it with any promo-code discount and floors once.
export function computePromoterDiscountMinor(unitMinor, promoter) {
  if (!promoter) return 0;
  const type = promoter.discount_type;
  const value = Number(promoter.discount_value || 0);
  if (!type || type === 'none' || value <= 0) return 0;
  if (type === 'percent') {
    return Math.min(unitMinor, Math.round(unitMinor * (value / 100)));
  }
  return Math.min(unitMinor, toMinor(value));
}

export function currencySymbol(code) {
  const map = { gbp: "£", eur: "€", usd: "$" };
  return map[String(code).toLowerCase()] || "";
}

export function formatMoney(minor, code) {
  return currencySymbol(code) + toMajor(minor).toFixed(2);
}

// --- Static single-use QR + ticket email helpers ---

// Build the static QR payload for a guestlist entry. This is generated once
// (at ticket issue time) and never changes — the same payload is embedded in
// the email QR and rendered on the guest pass. validateQR accepts this format.
export function buildQrPayload(entry) {
  const payload = JSON.stringify({
    eid: entry.event_id,
    gid: entry.id,
    sec: entry.qr_secret,
  });
  return btoa(payload);
}

export function buildQrImageUrl(entry) {
  const payload = buildQrPayload(entry);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}&bgcolor=FFFFFF&color=000000`;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function formatEventDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function buildTicketEmailHtml(entry, event) {
  const qrImg = buildQrImageUrl(entry);
  const passLink = `https://thedoorman.app/pass/${event.id}`;
  const dateStr = formatEventDate(event.date);
  const venueParts = [event.venue_name, event.address].filter(Boolean).join(" · ");
  const title = escapeHtml(event.title);
  const guestName = escapeHtml(entry.guest_name);
  const tierNote = entry.notes ? escapeHtml(entry.notes) : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a12;color:#e8e8f0;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7a7a9a;text-align:center;">DoorMan · Ticket Confirmation</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;text-align:center;">${title}</h1>
    ${guestName ? `<p style="margin:0 0 24px;text-align:center;color:#b0b0c8;">${guestName}</p>` : ""}
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:24px;text-align:center;">
      <img src="${qrImg}" alt="Your QR ticket" width="240" height="240" style="display:block;margin:0 auto 16px;border-radius:12px;background:#ffffff;padding:8px;" />
      <p style="margin:0 0 6px;font-size:13px;color:#7a7a9a;">Show this code at the door</p>
      <p style="margin:0;font-size:11px;color:#5a5a7a;">Single-use · valid until first scan</p>
    </div>
    <div style="background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:20px;margin-top:16px;">
      <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7a7a9a;">Event Details</p>
      <div style="font-size:14px;color:#e8e8f0;line-height:1.7;">
        ${dateStr ? `<div><span style="color:#7a7a9a;">Date:</span> ${escapeHtml(dateStr)}</div>` : ""}
        ${event.start_time ? `<div><span style="color:#7a7a9a;">Time:</span> ${escapeHtml(event.start_time)}${event.end_time ? " – " + escapeHtml(event.end_time) : ""}</div>` : ""}
        ${venueParts ? `<div><span style="color:#7a7a9a;">Venue:</span> ${escapeHtml(venueParts)}</div>` : ""}
        ${tierNote ? `<div><span style="color:#7a7a9a;">Ticket:</span> ${tierNote}</div>` : ""}
      </div>
    </div>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${passLink}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">View My Ticket</a>
    </div>
    <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#5a5a7a;">Or visit <a href="${passLink}" style="color:#7c3aed;">thedoorman.app</a> — log in with the email you used to purchase.</p>
    <p style="margin:24px 0 0;text-align:center;font-size:10px;color:#3a3a4a;">Powered by DoorMan</p>
  </div>
</body>
</html>`;
}

// Send the ticket confirmation email (with embedded QR + pass link).
// Never throws — returns { sent, error } so callers can log failures without
// blocking the purchase.
export async function sendTicketConfirmationEmail(base44, entry, event) {
  if (!entry || !entry.guest_email) return { sent: false, error: "No guest email" };
  try {
    const html = buildTicketEmailHtml(entry, event);
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: entry.guest_email,
      subject: `Your ticket for ${event.title}`,
      body: html,
    });
    return { sent: true };
  } catch (e) {
    console.log("sendTicketConfirmationEmail error", e?.message || String(e));
    return { sent: false, error: e?.message || String(e) };
  }
}