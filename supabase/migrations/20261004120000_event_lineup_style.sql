-- Per-event style for the DJ lineup names (chosen by the host, shown on the
-- event page). Stored as a short id resolved client-side to a preset.
alter table public.events add column if not exists lineup_style text not null default 'neon_cyan';

-- events uses per-column grants (additive); make lineup_style readable + writable.
grant select (lineup_style) on public.events to authenticated, anon;
grant update (lineup_style) on public.events to authenticated;
