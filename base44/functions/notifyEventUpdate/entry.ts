import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const { data: event, old_data: oldEvent, changed_fields } = body;
    if (!event || !event.id) return Response.json({ ok: true });

    // Only notify if meaningful fields changed
    const relevantFields = ["title", "date", "start_time", "end_time", "venue_name", "address", "dress_code", "description", "entry_notes", "status"];
    const hasRelevantChange = changed_fields?.some(f => relevantFields.includes(f));
    if (!hasRelevantChange) return Response.json({ ok: true, skipped: true });

    // Get all approved/invited guests
    const entries = await base44.asServiceRole.entities.GuestlistEntry.filter({ event_id: event.id });
    const guests = entries.filter(e => ["approved", "invited", "checked_in"].includes(e.status));
    if (!guests.length) return Response.json({ ok: true, skipped: "no guests" });

    // Build what changed
    const changes = [];
    if (changed_fields?.includes("date") && oldEvent?.date !== event.date) {
      changes.push(`📅 Date changed to: ${event.date}`);
    }
    if (changed_fields?.includes("start_time") && oldEvent?.start_time !== event.start_time) {
      changes.push(`🕐 Start time changed to: ${event.start_time}`);
    }
    if (changed_fields?.includes("end_time") && oldEvent?.end_time !== event.end_time) {
      changes.push(`🕐 End time changed to: ${event.end_time}`);
    }
    if (changed_fields?.includes("venue_name") && oldEvent?.venue_name !== event.venue_name) {
      changes.push(`📍 Venue changed to: ${event.venue_name}`);
    }
    if (changed_fields?.includes("address") && oldEvent?.address !== event.address) {
      changes.push(`🗺️ Address changed to: ${event.address}`);
    }
    if (changed_fields?.includes("dress_code") && oldEvent?.dress_code !== event.dress_code) {
      changes.push(`👔 Dress code changed to: ${event.dress_code}`);
    }
    if (changed_fields?.includes("entry_notes") && oldEvent?.entry_notes !== event.entry_notes) {
      changes.push(`📋 Entry notes updated: ${event.entry_notes}`);
    }
    if (changed_fields?.includes("status") && oldEvent?.status !== event.status) {
      changes.push(`🔔 Event status changed to: ${event.status}`);
    }

    if (!changes.length) {
      // Generic update
      changes.push("The host has updated event details. Check the event page for more info.");
    }

    const appUrl = "https://app.base44.com";
    const eventUrl = `${appUrl}/event/${event.id}`;

    const emailPromises = guests.map(guest =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: guest.guest_email,
        subject: `🔔 Update: ${event.title}`,
        body: `
Hi ${guest.guest_name || "there"},

The host has made updates to <strong>${event.title}</strong>:

${changes.map(c => `• ${c}`).join("\n")}

<a href="${eventUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">View Event</a>

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