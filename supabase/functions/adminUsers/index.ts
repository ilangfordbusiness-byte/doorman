// Admin-only user management: promote/demote admin, correct profile fields,
// and ban/unban (which blocks login via the Auth admin API). Every mutation is
// gated by requireAdmin() and written to admin_audit_log.
import { requireAdmin, auditAdmin, json, preflight, serviceClient } from '../_shared/db.ts';

// ~100 years — effectively permanent until an admin unbans.
const BAN_DURATION = '876000h';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const admin = await requireAdmin(req, svc);
    if (!admin) return json({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const { action, user_id } = body;
    if (!user_id) return json({ error: 'Missing user_id' }, 400);

    // Guard: an admin can't demote or ban themselves (avoids self-lockout).
    if (user_id === admin.id && (action === 'set_role' || action === 'ban')) {
      return json({ error: 'You cannot change your own admin status or ban yourself.' }, 400);
    }

    if (action === 'set_role') {
      const role = body.role;
      if (role !== 'user' && role !== 'admin') return json({ error: 'Invalid role' }, 400);
      const { error } = await svc.from('profiles').update({ role }).eq('id', user_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, 'set_role', 'profile', user_id, { role });
      return json({ ok: true });
    }

    if (action === 'update_profile') {
      const patch: Record<string, unknown> = {};
      for (const k of ['full_name', 'phone', 'instagram']) {
        if (k in body) patch[k] = body[k];
      }
      if (!Object.keys(patch).length) return json({ error: 'No fields to update' }, 400);
      const { error } = await svc.from('profiles').update(patch).eq('id', user_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, 'update_profile', 'profile', user_id, patch);
      return json({ ok: true });
    }

    if (action === 'ban' || action === 'unban') {
      const banning = action === 'ban';
      const { error: authErr } = await svc.auth.admin.updateUserById(user_id, {
        ban_duration: banning ? BAN_DURATION : 'none',
      });
      if (authErr) return json({ error: authErr.message }, 400);
      const { error } = await svc.from('profiles')
        .update({ banned_at: banning ? new Date().toISOString() : null })
        .eq('id', user_id);
      if (error) return json({ error: error.message }, 400);
      await auditAdmin(svc, admin, action, 'profile', user_id, {});
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
