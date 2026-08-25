-- DoorMan: automation wiring — cron schedules and database webhooks that
-- invoke the edge functions, replacing Base44's platform automations.
--
-- Configuration lives in Vault (set once per environment, see README runbook):
--   functions_base_url  e.g. https://<ref>.supabase.co/functions/v1
--   automation_secret   the same value as the functions' AUTOMATION_SECRET env
-- Until both secrets exist, invocations no-op with a notice (local dev safe).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_edge_function(fn text, payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_base_url text;
  v_secret text;
begin
  select decrypted_secret into v_base_url
    from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'automation_secret';
  if v_base_url is null or v_secret is null then
    raise notice 'invoke_edge_function: vault secrets not configured, skipping %', fn;
    return;
  end if;
  perform net.http_post(
    url := v_base_url || '/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', v_secret),
    body := payload
  );
end $$;

-- Reads Vault and carries the automation secret — never callable by clients.
revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Database webhooks (Base44 "automations")
-- ---------------------------------------------------------------------------

-- Event details changed -> email live guests (function filters relevant fields).
create or replace function public.trg_notify_event_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.invoke_edge_function('notifyEventUpdate',
    jsonb_build_object('record', to_jsonb(new), 'old_record', to_jsonb(old)));
  return new;
end $$;

create trigger events_notify_update
  after update on public.events
  for each row
  when (old.* is distinct from new.*)
  execute function public.trg_notify_event_update();

-- Host chat message -> email live guests (function verifies sender is host).
create or replace function public.trg_notify_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.invoke_edge_function('notifyChatMessage',
    jsonb_build_object('record', to_jsonb(new)));
  return new;
end $$;

create trigger event_messages_notify
  after insert on public.event_messages
  for each row
  execute function public.trg_notify_chat_message();

-- ---------------------------------------------------------------------------
-- Cron schedules (idempotent: unschedule first if re-applied)
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('send-event-reminders');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('auto-checkout-guests');
exception when others then null;
end $$;

-- Daily reminders at 09:00 UTC (today / tomorrow / in-7-days events).
select cron.schedule('send-event-reminders', '0 9 * * *',
  $$select public.invoke_edge_function('sendEventReminders', '{}'::jsonb)$$);

-- Auto-checkout sweep every 15 minutes.
select cron.schedule('auto-checkout-guests', '*/15 * * * *',
  $$select public.invoke_edge_function('autoCheckoutGuests', '{}'::jsonb)$$);
