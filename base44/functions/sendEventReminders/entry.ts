import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const args = body.args ?? {};
    if (args.trigger_secret !== Deno.env.get("DOORMAN_AUTOMATION_KEY")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const base44 = createClientFromRequest(req);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);
    const in7Str = in7days.toISOString().split("T")[0];

    // Fetch published events happening today, tomorrow, or in 7 days
    const allEvents = await base44.asServiceRole.entities.Event.filter({ status: "published" });
    const relevantEvents = allEvents.filter(e =>
      [todayStr, tomorrowStr, in7Str].includes(e.date)
    );

    if (!relevantEvents.length) return Response.json({ ok: true, skipped: "no upcoming events" });

    const appUrl = "https://app.base44.com";
    let totalNotified = 0;

    for (const event of relevantEvents) {
      const isToday = event.date === todayStr;
      const isTomorrow = event.date === tomorrowStr;
      const isIn7 = event.date === in7Str;

      const label = isToday ? "TODAY" : isTomorrow ? "TOMORROW" : "in 7 days";
      const emoji = isToday ? "🎉" : isTomorrow ? "⏰" : "📅";

      const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ event_id: event.id });
      const guests = entries.filter(e => ["approved", "invited", "checked_in"].includes(e.status));
      if (!guests.length) continue;

      const eventUrl = `${appUrl}/event/${event.id}`;
      const passUrl = `${appUrl}/pass/${event.id}`;

      const emailPromises = guests.map(guest =>
        base44.asServiceRole.integrations.Core.SendEmail({
          to: guest.guest_email,
          subject: `${emoji} Reminder: ${event.title} is ${label}!`,
          body: `
Hi ${escapeHtml(guest.guest_name || "there")},

This is a friendly reminder that <strong>${escapeHtml(event.title)}</strong> is happening <strong>${label}</strong>!

📅 Date: ${escapeHtml(event.date)}
🕐 Time: ${escapeHtml(event.start_time)}${event.end_time ? ` – ${escapeHtml(event.end_time)}` : ""}
${event.venue_name ? `📍 Venue: ${escapeHtml(event.venue_name)}` : ""}
${event.address ? `🗺️ Address: ${escapeHtml(event.address)}` : ""}
${event.dress_code ? `👔 Dress Code: ${escapeHtml(event.dress_code)}` : ""}
${event.entry_notes ? `📋 Entry Notes: ${escapeHtml(event.entry_notes)}` : ""}

<div style="margin-top:16px;display:flex;gap:12px;">
  <a href="${passUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:8px;">Open QR Pass</a>
  <a href="${eventUrl}" style="display:inline-block;padding:10px 20px;background:#1f1f2e;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;border:1px solid #444;">Event Details</a>
</div>

See you there! 🙌
— DoorMan
          `.trim()
        })
      );

      await Promise.allSettled(emailPromises);
      totalNotified += guests.length;
    }

    return Response.json({ ok: true, events: relevantEvents.length, notified: totalNotified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});