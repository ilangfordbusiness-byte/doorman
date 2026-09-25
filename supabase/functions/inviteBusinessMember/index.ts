// Invite someone to co-manage a business account. Owner-only.
//
// Upserts the invitee's business_members row (pending) and emails them a link
// to /business/:id/invite where they accept or decline. The invitee does not
// need a DoorMan account yet: the row is keyed by email and the signup trigger
// back-links user_id when they register with that address. Re-inviting a
// declined or pending person resends the email; an accepted member is a no-op.
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
    const businessId = String(body.business_id || '');
    const email = String(body.email || '').trim().toLowerCase();
    if (!businessId) return json({ error: 'Missing business_id' }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

    const { data: biz } = await svc.from('business_accounts')
      .select('id, owner_id, business_name, business_picture_url')
      .eq('id', businessId).maybeSingle();
    if (!biz) return json({ error: 'Business account not found' }, 404);
    if (biz.owner_id !== user.id) {
      return json({ error: 'Only the business owner can invite team members' }, 403);
    }
    if (email === String(user.email || '').toLowerCase()) {
      return json({ error: 'You already own this business account.' }, 400);
    }

    // Link to an existing account now if there is one; otherwise the signup
    // trigger fills user_id later.
    const { data: profile } = await svc.from('profiles').select('id')
      .eq('email', email).maybeSingle();

    const { data: existing } = await svc.from('business_members')
      .select('id, status').eq('business_id', biz.id).eq('email', email).maybeSingle();
    if (existing?.status === 'accepted') {
      return json({ ok: true, already: true, status: 'accepted' });
    }

    let memberId = existing?.id ?? null;
    if (existing) {
      const { error } = await svc.from('business_members')
        .update({ status: 'pending', user_id: profile?.id ?? null })
        .eq('id', existing.id);
      if (error) return json({ error: error.message }, 400);
    } else {
      const { data: row, error } = await svc.from('business_members')
        .insert({ business_id: biz.id, email, user_id: profile?.id ?? null, status: 'pending' })
        .select('id').single();
      if (error) return json({ error: error.message }, 400);
      memberId = row.id;
    }

    const inviteUrl = `${appOrigin()}/business/${biz.id}/invite`;
    const inviter = user.full_name || user.email;
    const bodyHtml = emailCard(null, `
      <div style="font-size:14px;color:#e8e8f0;line-height:1.7;">
        <p style="margin:0 0 8px;">${escapeHtml(inviter)} has invited you to help manage
        <strong>${escapeHtml(biz.business_name)}</strong> on DoorMan.</p>
        <p style="margin:0;">Team members can create and run the business's events,
        manage guestlists and check guests in at the door.</p>
      </div>`);
    const emailResult = await sendEmail({
      to: email,
      subject: `${inviter} invited you to manage ${biz.business_name} on DoorMan`,
      html: brandedEmail({
        kicker: 'Team Invite',
        title: biz.business_name,
        subtitle: 'You have been invited to join the team.',
        bodyHtml,
        buttons: [{ label: 'View Invite', href: inviteUrl }],
        footnote: profile
          ? 'Sign in to DoorMan to accept or decline this invite.'
          : `Sign up for DoorMan with ${escapeHtml(email)} to accept this invite.`,
      }),
    });

    return json({
      ok: true,
      member_id: memberId,
      status: 'pending',
      has_account: !!profile,
      emailed: emailResult.sent,
      resent: !!existing,
    });
  } catch (error) {
    console.error('inviteBusinessMember error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
