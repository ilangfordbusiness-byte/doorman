// "Is this the caller's own row?" checks for edge functions.
//
// Emails are citext in the database, so RLS and RPCs such as my_qr_payload
// compare them case-insensitively. A plain `!==` in TypeScript does not, so a
// guest whose entry was added as "Sam@Example.com" (no guest_user_id yet) got
// 403 here while the static pass worked. Use these helpers instead.
//
// No phone match on purpose: profiles.phone is not verified (anyone can type
// any number in Profile), so a phone must never prove ticket ownership.

// deno-lint-ignore no-explicit-any
type Row = any;

// Case-insensitive, trimmed email equality. Empty or missing never matches,
// so a phone-only entry (guest_email '') can never match a user with no email.
export function sameEmail(a: unknown, b: unknown): boolean {
  const x = String(a ?? '').trim().toLowerCase();
  return x !== '' && x === String(b ?? '').trim().toLowerCase();
}

// Owner = the linked account, or the entry's email (ignoring case).
// `entry` needs guest_user_id and guest_email; `user` is a profiles row
// (getCaller / getVerifiedCaller).
export function ownsEntry(entry: Row, user: Row): boolean {
  if (!entry || !user) return false;
  return (!!entry.guest_user_id && entry.guest_user_id === user.id)
    || sameEmail(entry.guest_email, user.email);
}
