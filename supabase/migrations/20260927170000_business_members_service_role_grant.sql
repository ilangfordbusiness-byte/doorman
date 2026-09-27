-- business_members was created (20260918120000) with grants for authenticated
-- only. The inviteBusinessMember and acceptBusinessMember edge functions use
-- the service client and failed with "permission denied for table
-- business_members", so team invites could neither be sent nor accepted.
-- RLS does not apply to service_role; the table grant is what was missing.
grant select, insert, update, delete on public.business_members to service_role;
