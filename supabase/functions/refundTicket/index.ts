// No-refunds policy: all ticket sales are final.
//
// Refunds are no longer offered in DoorMan. This used to be a guest
// self-service refund (the ticket owner cancelling their own paid ticket).
// The endpoint is kept as a stub so any client — including a direct API call
// that bypasses the removed UI — gets a clear, enforced rejection rather than
// running the old refund flow. The previous implementation lives in git
// history if the policy is ever reversed.
import { json, preflight } from '../_shared/db.ts';

Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;
  return json({ error: 'Refunds aren’t available — all ticket sales are final.' }, 403);
});
