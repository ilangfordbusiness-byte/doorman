// Removes everything setup.mjs created for this LT_RUN: the event (cascades
// entries, staff, tiers, messages) after its orders, and every fixture auth
// user (profiles cascade). Safe to re-run.
//   node loadtest/cleanup.mjs
import { cfg, requireKeys, svcHeaders, rest, pmap } from "./lib/env.mjs";
requireKeys();
const like = `${cfg.run}-%25@${cfg.domain}`;
const events = await rest("GET", `events?select=id,title&title=like.LOADTEST%20${cfg.run}%25`);
for (const e of events) {
  await rest("DELETE", `ticket_transfers?event_id=eq.${e.id}`);
  await rest("DELETE", `ticket_orders?event_id=eq.${e.id}`);
  await rest("DELETE", `events?id=eq.${e.id}`);
  console.log(`deleted event ${e.id} (${e.title})`);
}
const users = await rest("GET", `profiles?select=id,email&email=like.${like}&limit=10000`);
await pmap(users, 8, async (u) => {
  const r = await fetch(`${cfg.auth}/admin/users/${u.id}`, { method: "DELETE", headers: svcHeaders() });
  if (!r.ok) console.log(`delete ${u.email}: ${r.status} ${await r.text()}`);
});
console.log(`deleted ${users.length} fixture users`);
