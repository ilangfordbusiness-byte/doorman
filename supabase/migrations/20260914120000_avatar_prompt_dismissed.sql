-- ===========================================================================
-- Let users skip the profile-picture onboarding step. Tapping "Later" in
-- PhoneSetupGate stamps profiles.avatar_prompt_dismissed_at so the step never
-- shows again on any device (a timestamp rather than a boolean so a future
-- "re-prompt after N months" needs no schema change). Column + grants only;
-- the gate reads it through auth.me(). Name/phone/instagram stay mandatory.
-- ===========================================================================
alter table public.profiles add column if not exists avatar_prompt_dismissed_at timestamptz;

-- Column-level grants are additive: readable + self-editable, like snapchat
-- (20260909120000_profile_snapchat.sql).
grant select (avatar_prompt_dismissed_at) on public.profiles to authenticated;
grant update (avatar_prompt_dismissed_at) on public.profiles to authenticated;
