// Mandatory onboarding gate. Every signed-in user must have a full name, phone
// and instagram before using the app, and is asked for a profile picture. Email
// sign-ups supply name/phone/instagram at signup (so they only see the avatar
// step); Google sign-ins are walked through whichever fields they're missing.
// The avatar lives here (not on the signup form) because uploading it needs a
// session. Two regimes:
//  - Accounts created on/after AVATAR_MANDATORY_FROM MUST add a picture to finish
//    onboarding — the step has no skip and recurs every visit until they do.
//  - Older accounts are reminded once a week: "Skip for now" stamps
//    profiles.avatar_prompt_dismissed_at to SNOOZE the prompt for 7 days.
// A picture can always be added/changed from /profile.
export const ORDER = ["name", "phone", "instagram", "avatar"];

// New accounts from this date on must add a profile picture (no skip). Set to
// the deploy date; older accounts get the weekly skippable reminder instead.
const AVATAR_MANDATORY_FROM = new Date("2026-10-04T00:00:00Z");
const AVATAR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function avatarMandatory(me) {
  return !!me?.created_date && new Date(me.created_date) >= AVATAR_MANDATORY_FROM;
}
export function avatarRequired(me) {
  if (!me || me.profile_picture) return false;              // already has a picture
  if (avatarMandatory(me)) return true;                     // new account: must add, every visit
  const snoozed = me.avatar_prompt_dismissed_at;            // last "Skip for now"
  if (snoozed && Date.now() - new Date(snoozed).getTime() < AVATAR_SNOOZE_MS) return false;
  return true;                                              // older account: weekly reminder
}

export function firstMissing(me, includeAvatar) {
  const hasName = !!me?.full_name && me.full_name.trim().split(/\s+/).length >= 2;
  if (!hasName) return "name";
  if (!me?.phone) return "phone";
  if (!me?.instagram) return "instagram";
  if (includeAvatar && !me?.profile_picture) return "avatar";
  return null;
}

// Does this user still have an onboarding step to complete?
export function needsProfileSetup(me) {
  return !!me && firstMissing(me, avatarRequired(me)) !== null;
}
