// Admin-only event & content oversight: unpublish / cancel / delete any event,
// and remove an event chat message. Gated by requireAdmin(); every mutation is
// written to admin_audit_log.
import { requireAdmin, auditAdmin, json, preflight, serviceClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const admin = await requireAdmin(req, svc);
    if (!admin) return json({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const { action } = body;

    if (action === 'delete_message') {
      const { message_id } = body;
      if (!message_id) return json({ error: 'Missing message_id' }, 400);
      const { error } = await svc.from('event_messages').delete().eq('id', message_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, 'delete_message', 'event_message', message_id, {});
      return json({ ok: true });
    }

    const { event_id } = body;
    if (!event_id) return json({ error: 'Missing event_id' }, 400);

    if (action === 'unpublish' || action === 'cancel') {
      const status = action === 'unpublish' ? 'draft' : 'cancelled';
      const { error } = await svc.from('events').update({ status }).eq('id', event_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, action, 'event', event_id, { status });
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await svc.from('events').delete().eq('id', event_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, 'delete', 'event', event_id, {});
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
