-- ===========================================================================
-- Add an optional free-text location ("London, UK") to profiles, editable by
-- the owner from the Account page and shown wherever a profile is viewable —
-- mirroring the existing instagram / snapchat fields. Column + grants only;
-- the profile modals already read it through auth.getProfile().
-- ===========================================================================
alter table public.profiles add column if not exists location text;

-- Keep it a short label, not an address or a bio. Empty strings are stored as
-- null by the data layer; the constraint guards against any other client.
alter table public.profiles
  add constraint profiles_location_length
  check (location is null or char_length(location) between 1 and 100);

-- Column-level grants are additive: readable + self-editable, like snapchat
-- (20260909120000_profile_snapchat.sql).
grant select (location) on public.profiles to authenticated;
grant update (location) on public.profiles to authenticated;
