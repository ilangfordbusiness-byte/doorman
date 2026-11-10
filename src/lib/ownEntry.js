// Is this guestlist entry the viewer's own? By account id, or by email
// (ignoring case), like the Guest tab. Managers and admins can read the whole
// guestlist, so pages filter the rows with this to find "my" ticket.
// Empty values never match: a phone-only entry has guest_email "".
// No phone match on purpose: profile phones are not verified.
export function isOwnEntry(entry, me) {
  if (!entry || !me) return false;
  if (entry.guest_user_id && entry.guest_user_id === me.id) return true;
  const myEmail = String(me.email || "").trim().toLowerCase();
  return !!myEmail && String(entry.guest_email || "").trim().toLowerCase() === myEmail;
}
