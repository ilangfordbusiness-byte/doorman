// Puts every scanned ticket for the load-test event back to "approved" so the
// check-in scenario can be re-run with a different scanner count.
//   node loadtest/reset-checkins.mjs
import { requireKeys, loadState, rest } from "./lib/env.mjs";
requireKeys();
const st = loadState();
const rows = await rest("PATCH", `guestlist_entries?event_id=eq.${st.event_id}&status=eq.checked_in&select=id`, { status: "approved", checked_in_at: null, checked_in_by: null });
console.log(`reset ${rows.length} check-ins`);
