// Invite someone to help run a door list. Owner-only.
//
// Adds their door_list_members row (keyed by email, so they don't need a
// DoorMan account yet: access is granted by their signed-in email) and emails
// them a link straight to the list. Re-inviting resends the email.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { appOrigin, brandedEmail, emailCard, escapeHtml, sendEmail } from '../_shared/email.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const listId = String(body.list_id || '');
    const email = String(body.email || '').trim().toLowerCase();
    if (!listId) return json({ error: 'Missing list_id' }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

    const { data: list } = await svc.from('door_lists')
      .select('id, name, owner_id').eq('id', listId).maybeSingle();
    if (!list) return json({ error: 'List not found' }, 404);
    // Only allow-listed accounts can create lists (RLS), so owning one is the
    // whole check here.
    if (list.owner_id !== user.id) {
      return json({ error: 'Only the list owner can invite people' }, 403);
    }
    if (email === String(user.email || '').toLowerCase()) {
      return json({ error: "That's you — you already own this list." }, 400);
    }

    const { data: profile } = await svc.from('profiles').select('id')
      .eq('email', email).maybeSingle();
    const { data: existing } = await svc.from('door_list_members')
      .select('id').eq('list_id', list.id).eq('email', email).maybeSingle();
    if (!existing) {
      const { error } = await svc.from('door_list_members')
        .insert({ list_id: list.id, email, user_id: profile?.id ?? null, invited_by: user.id });
      if (error) return json({ error: error.message }, 400);
    }

    const listUrl = `${appOrigin()}/door-lists/${list.id}`;
    const inviter = user.full_name || user.email;
    const bodyHtml = emailCard(null, `
      <div style="font-size:14px;color:#e8e8f0;line-height:1.7;">
        <p style="margin:0 0 8px;">${escapeHtml(inviter)} has added you to the door list
        <strong>${escapeHtml(list.name)}</strong> on DoorMan.</p>
        <p style="margin:0;">You can search the list, add people and check guests in.
        Check-ins show up live on everyone's phone.</p>
      </div>`);
    const emailResult = await sendEmail({
      to: email,
      subject: `${inviter} added you to the door list "${list.name}"`,
      html: brandedEmail({
        kicker: 'Door List',
        title: list.name,
        subtitle: 'You can now check guests in.',
        bodyHtml,
        buttons: [{ label: 'Open the list', href: listUrl }],
        footnote: profile
          ? 'Sign in to DoorMan with this email to open the list.'
          : `Sign up for DoorMan with ${escapeHtml(email)} to open the list.`,
      }),
    });

    return json({ ok: true, has_account: !!profile, emailed: emailResult.sent, resent: !!existing });
  } catch (error) {
    console.error('inviteDoorListMember error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
