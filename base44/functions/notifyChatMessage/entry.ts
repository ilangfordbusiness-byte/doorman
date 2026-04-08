import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const { data: message } = body;
    if (!message || !message.event_id || !message.is_host) {
      // Only notify for host messages
      return Response.json({ ok: true, skipped: "not a host message" });
    }

    const events = await base44.asServiceRole.entities.Event.filter({ id: message.event_id });
    const event = events[0];
    if (!event) return Response.json({ ok: true, skipped: "event not found" });

    // Get all approved/invited guests (exclude the host)
    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ event_id: message.event_id });
    const guests = entries.filter(e =>
      ["approved", "invited", "checked_in"].includes(e.status) &&
      e.guest_email !== message.sender_email
    );
    if (!guests.length) return Response.json({ ok: true, skipped: "no guests" });

    const appUrl = "https://app.base44.com";
    const eventUrl = `${appUrl}/event/${event.id}`;

    const emailPromises = guests.map(guest =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: guest.guest_email,
        subject: `💬 New message from ${event.host_name || "the host"} – ${event.title}`,
        body: `
Hi ${guest.guest_name || "there"},

<strong>${message.sender_name || "The host"}</strong> sent a message in <strong>${event.title}</strong>:

<blockquote style="border-left:3px solid #7c3aed;padding:8px 16px;margin:12px 0;color:#ccc;">${message.text}</blockquote>

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