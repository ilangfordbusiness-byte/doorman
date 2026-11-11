// Per-account feature switches. UI gates only: the database enforces the same
// lists (see can_use_door_lists in 20261111120000_door_lists.sql), so keep the
// two in sync.
export const DOOR_LIST_EMAILS = ["soooomuchcoffee@gmail.com"];

export function canUseDoorLists(user) {
  return DOOR_LIST_EMAILS.includes(String(user?.email || "").toLowerCase());
}
