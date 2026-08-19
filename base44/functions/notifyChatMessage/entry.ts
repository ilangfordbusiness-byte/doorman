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

    const { data: messageData } = body;
    if (!messageData || !messageData.id || !messageData.event_id) {
      return Response.json({ ok: true, skipped: "incomplete payload" });
    }

    // Re-fetch the message from the DB so we act only on a real record (not a
    // fabricated request body) and confirm it was authored by the event host.
    let message;
    try {
      const msgs = await base44.asServiceRole.entities.EventMessage.filter({ id: messageData.id });
      message = msgs[0];
    } catch {
      return Response.json({ ok: true, skipped: "invalid message reference" });
    }
    if (!message) return Response.json({ ok: true, skipped: "message not found" });
    if (!message.is_host) return Response.json({ ok: true, skipped: "not a host message" });

    let event;
    try {
      const events = await base44.asServiceRole.entities.Event.filter({ id: message.event_id });
      event = events[0];
    } catch {
      return Response.json({ ok: true, skipped: "invalid event reference" });
    }
    if (!event) return Response.json({ ok: true, skipped: "event not found" });

    // Only the event host may trigger guest notifications. created_by is the
    // platform-stamped creator email, so it can't be spoofed by a caller.
    if (String(event.host_email || "").toLowerCase() !== String(message.created_by || "").toLowerCase()) {
      return Response.json({ ok: true, skipped: "sender is not the host" });
    }

    // Limit replay windows: only notify for messages created in the last 2 minutes.
    const createdMs = message.created_date ? new Date(message.created_date).getTime() : 0;
    if (createdMs && Date.now() - createdMs > 120000) {
      return Response.json({ ok: true, skipped: "stale message" });
    }

    // Get all approved/invited guests (exclude the host)
    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ event_id: message.event_id });
    const guests = entries.filter(e =>
      ["approved", "invited", "checked_in"].includes(e.status) &&
      e.guest_email !== message.created_by
    );
    if (!guests.length) return Response.json({ ok: true, skipped: "no guests" });

    const appUrl = "https://app.base44.com";
    const eventUrl = `${appUrl}/event/${event.id}`;
    const senderName = escapeHtml(message.sender_name || "The host");
    const messageText = escapeHtml(message.text || "");
    const eventTitle = escapeHtml(event.title || "");

    const emailPromises = guests.map(guest =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: guest.guest_email,
        subject: `💬 New message from ${event.host_name || "the host"} – ${event.title}`,
        body: `
Hi ${escapeHtml(guest.guest_name || "there")},

<strong>${senderName}</strong> sent a message in <strong>${eventTitle}</strong>:

<blockquote style="border-left:3px solid #7c3aed;padding:8px 16px;margin:12px 0;color:#ccc;">${messageText}</blockquote>

<a href="${eventUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">View Event Chat</a>

— DoorMan
        `.trim()
      })
    );

    await Promise.allSettled(emailPromises);
    return Response.json({ ok: true, notified: guests.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});