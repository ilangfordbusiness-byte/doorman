// Client-side matching for the "Who's Going" search. The attendee payload
// (get_event_attendees RPC) already carries name, email and social handles for
// everyone entitled to see names, so filtering here exposes nothing new.

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/^@+/, "");
}

// Case-insensitive substring match on name, email, or a social handle. A
// leading "@" is ignored so "@jane" matches an Instagram/Snapchat handle.
export function matchesAttendee(attendee, query) {
  const q = norm(query);
  if (!q) return true;
  return [attendee.name, attendee.email, attendee.instagram, attendee.snapchat]
    .some((field) => norm(field).includes(q));
}

export function filterAttendees(attendees, query) {
  if (!norm(query)) return attendees;
  return attendees.filter((a) => matchesAttendee(a, query));
}
