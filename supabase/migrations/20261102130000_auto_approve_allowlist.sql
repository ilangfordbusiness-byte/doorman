-- ===========================================================================
-- Auto-approve allowlist.
--
-- A host can mark a set of emails (e.g. a list they imported) as pre-approved
-- for an event. When any of those people lands on the guestlist — whether they
-- request to join through the app, or accept an emailed invite and join — a
-- BEFORE INSERT trigger flips their entry straight to 'approved' instead of
-- leaving it in the Requests queue. Matching is by email, which is reliable
-- because both paths require the guest to be signed in.
--
-- No email is sent by the trigger: the guest is signed in, so they see their
-- approved pass in the app immediately. (Host manual-approve still emails the
-- free ticket from the client as before.)
-- ===========================================================================

create table if not exists public.event_auto_approve (
  event_id uuid not null references public.events(id) on delete cascade,
  email citext not null,
  created_at timestamptz not null default now(),
  primary key (event_id, email)
);

alter table public.event_auto_approve enable row level security;

-- Only the event's managers (host / accepted co-hosts / admin) manage its list.
create policy event_auto_approve_select on public.event_auto_approve
  for select to authenticated using (public.is_event_manager(event_id));
create policy event_auto_approve_insert on public.event_auto_approve
  for insert to authenticated with check (public.is_event_manager(event_id));
create policy event_auto_approve_delete on public.event_auto_approve
  for delete to authenticated using (public.is_event_manager(event_id));

grant select, insert, delete on public.event_auto_approve to authenticated;

-- Flip a newly-created requested/invited entry to approved when the guest's
-- email is on the event's allowlist. Security definer so it can read the
-- allowlist regardless of who is inserting (a guest inserting their own
-- request cannot select event_auto_approve themselves).
create or replace function public.apply_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('requested', 'invited')
     and new.guest_email is not null
     and exists (
       select 1 from event_auto_approve a
       where a.event_id = new.event_id and a.email = new.guest_email
     ) then
    new.status := 'approved';
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_auto_approve on public.guestlist_entries;
create trigger trg_apply_auto_approve
  before insert on public.guestlist_entries
  for each row execute function public.apply_auto_approve();
