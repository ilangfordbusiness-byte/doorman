// Post-run integrity checks straight from the database (service role):
// every scanned ticket is checked in exactly once, every paid order has
// exactly `quantity` entries, tier counters match issued tickets, and the
// scarce tier did not oversell. Prints a table; exits 1 on any violation.
//
//   node loadtest/verify.mjs
import { requireKeys, loadState, rest } from "./lib/env.mjs";
requireKeys();
const st = loadState();
const E = st.event_id;
let bad = 0;
const fail = (m) => { bad++; console.log(`  FAIL ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

const entries = await rest("GET", `guestlist_entries?select=id,status,order_id,checked_in_at,checked_in_by,guest_email&event_id=eq.${E}&limit=10000`);
const orders = await rest("GET", `ticket_orders?select=id,status,quantity,tier_id,guestlist_entry_id,stripe_session_id&event_id=eq.${E}&limit=10000`);
const tiers = await rest("GET", `ticket_tiers?select=id,name,quantity,sold,sales_status&event_id=eq.${E}`);
const msgs = await rest("GET", `event_messages?select=id&event_id=eq.${E}&limit=10000`);

const byStatus = {};
for (const e of entries) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
console.log("Entries by status:", JSON.stringify(byStatus));
console.log("Orders:", JSON.stringify(orders.reduce((a, o) => ((a[o.status] = (a[o.status] || 0) + 1), a), {})));
console.log("Messages:", msgs.length);

// Check-ins: every checked_in entry has a timestamp and a scanner id.
const ci = entries.filter((e) => e.status === "checked_in");
const broken = ci.filter((e) => !e.checked_in_at || !e.checked_in_by);
broken.length ? fail(`${broken.length} checked_in entries missing checked_in_at/by`) : ok(`${ci.length} checked-in entries all stamped`);

// Orders: paid orders have exactly quantity entries; pending orders have none.
const entriesByOrder = new Map();
for (const e of entries) if (e.order_id) entriesByOrder.set(e.order_id, (entriesByOrder.get(e.order_id) || 0) + 1);
let dup = 0, missing = 0, ghost = 0;
for (const o of orders) {
  const n = entriesByOrder.get(o.id) || 0;
  if (o.status === "paid" && n > o.quantity) dup++;
  if (o.status === "paid" && n < o.quantity) missing++;
  if (o.status === "pending" && n > 0) ghost++;
}
dup ? fail(`${dup} paid orders have MORE entries than quantity (double fulfilment)`) : ok("no paid order has extra entries (webhook exactly-once held)");
missing ? fail(`${missing} paid orders have fewer entries than quantity`) : ok("every paid order has its entries");
ghost ? fail(`${ghost} pending orders have entries`) : ok("no pending order has entries");

// Tiers: sold == issued entries for that tier (via orders); scarce not oversold.
for (const t of tiers) {
  const issued = orders.filter((o) => o.tier_id === t.id && o.status === "paid").reduce((a, o) => a + (entriesByOrder.get(o.id) || 0), 0);
  const paidOrders = orders.filter((o) => o.tier_id === t.id && o.status === "paid").length;
  console.log(`Tier ${t.name}: quantity ${t.quantity}, sold ${t.sold}, status ${t.sales_status}, paid orders ${paidOrders}, tickets issued ${issued}`);
  if (issued > t.quantity) fail(`tier ${t.name} OVERSOLD: ${issued} tickets issued for ${t.quantity} seats`);
  else ok(`tier ${t.name} within capacity`);
  if (t.sold !== issued) fail(`tier ${t.name} sold counter ${t.sold} != issued ${issued}`);
}
process.exit(bad ? 1 : 0);
