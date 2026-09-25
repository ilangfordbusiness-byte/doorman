-- Weekly "new events" digest.
--
-- Every Thursday the sendNewEventsDigest edge function emails every account
-- holder the public events that were posted in the last seven days, and does
-- nothing when there are none.
--
-- "Posted" means the moment an event became visible, not the moment the row
-- was created: a host can save a draft weeks before publishing it, and a
-- created_at window would either miss that event or include it in the wrong
-- week. events.published_at records the first transition to 'published'
-- (kept on later edits and on unpublish/republish so an event is only ever
-- "new" once). Existing published events are backfilled from created_at.
--
-- The column is written only by the trigger (no client grant), so it can be
-- trusted by the digest and by anything that later needs a stable "since
-- published" instant.

alter table public.events add column if not exists published_at timestamptz;

create or replace function public.set_event_published_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end $$;

drop trigger if exists events_published_at on public.events;
create trigger events_published_at
  before insert or update of status on public.events
  for each row execute function public.set_event_published_at();

update public.events set published_at = created_at
  where status in ('published', 'completed') and published_at is null;

-- The digest reads "published in the last week", newest first.
create index if not exists events_published_at_idx on public.events (published_at desc)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- Cron: Thursdays at 09:00 UTC (same hour as the daily reminders).
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('send-new-events-digest');
exception when others then null;
end $$;

select cron.schedule('send-new-events-digest', '0 9 * * 4',
  $$select public.invoke_edge_function('sendNewEventsDigest', '{}'::jsonb)$$);
