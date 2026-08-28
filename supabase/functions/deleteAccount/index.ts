// Account deletion. A hard delete of the auth user isn't safe here: several
// tables reference profiles(id) with NO ACTION (guestlist_entries.created_by,
// ticket_orders.created_by, promo_codes.created_by, checked_in_by, ...), so it
// would fail for anyone who ever added a guest or hosted an event. Instead we
// anonymise: free the login email (so it can be reused), block sign-in, and
// scrub personal data — while leaving event records referentially intact.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';

const BAN_DURATION = '876000h'; // ~100 years — effectively permanent

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // A unique tombstone frees the real email on both auth.users and profiles
    // (both hold a UNIQUE email), so the address can be signed up with again.
    const tombstone = `deleted+${user.id}@deleted.doorman`;

    // Free the login email and block any further sign-in.
    const { error: authErr } = await svc.auth.admin.updateUserById(user.id, {
      email: tombstone,
      ban_duration: BAN_DURATION,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    // Scrub the profile: release the unique email and clear personal fields.
    const { error } = await svc.from('profiles').update({
      email: tombstone,
      full_name: 'Deleted user',
      phone: null,
      instagram: null,
      avatar_url: null,
    }).eq('id', user.id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
