// Builds the host's CSV export for one event from data the api layer already
// hands to the analytics and guestlist pages. Money arrives here in major
// units (data.js maps *_minor -> pounds); this file only formats it.
import { toCsv } from "@/lib/csv";
import { tierRemaining } from "@/lib/tiers";

const money = (v) => (Number(v) || 0).toFixed(2);
const yesNo = (v) => (v ? "yes" : "no");
const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

export const GUEST_COLUMNS = [
  "Name", "Email", "Phone", "Guest status", "Source", "Plus one", "Plus-one name",
  "Ticket tier", "Quantity", "Unit price", "Discount", "Price paid", "Platform fee",
  "Host net", "Promo code", "Promoter code", "Order status", "Purchased at",
  "Checked in at", "Added at",
];

// One row per guestlist entry, with its ticket order (if any) joined on; paid
// or refunded orders that have no guestlist entry are appended so revenue
// always matches the summary.
export function buildGuestRows({ guests = [], orders = [], promos = [] }) {
  const promoById = new Map(promos.map((p) => [p.id, p.code]));
  const orderByEntry = new Map();
  for (const o of orders) if (o.guestlist_entry_id) orderByEntry.set(o.guestlist_entry_id, o);

  const row = (g, o) => [
    g?.guest_name ?? o?.guest_name ?? "",
    g?.guest_email ?? o?.guest_email ?? "",
    g?.guest_phone ?? "",
    g?.status ?? "",
    g?.source ?? "",
    g ? yesNo(g.plus_one) : "",
    g?.plus_one_name ?? "",
    o?.tier_name ?? "",
    o ? o.quantity : "",
    o ? money(o.unit_price) : "",
    o ? money((Number(o.discount_amount) || 0) + (Number(o.promoter_discount_amount) || 0)) : "",
    o ? money(o.paid_amount) : "",
    o ? money(o.platform_fee) : "",
    o ? money(o.host_net) : "",
    o ? (promoById.get(o.promo_code_id) ?? "") : "",
    o?.promoter_code ?? "",
    o?.status ?? "",
    o?.created_at ?? "",
    g?.checked_in_at ?? "",
    g?.created_at ?? o?.created_at ?? "",
  ];

  const seen = new Set();
  const rows = guests.map((g) => {
    const o = orderByEntry.get(g.id);
    if (o) seen.add(o.id);
    return row(g, o);
  });
  for (const o of orders) if (!seen.has(o.id) && o.status !== "pending") rows.push(row(null, o));
  return rows;
}

// The full host export: summary figures, per-tier / per-promoter / per-promo
// breakdowns, daily sales, then the guest & ticket rows.
export function buildEventExportCsv({ event, tiers = [], orders = [], promos = [], promoters = [], guests = [] }) {
  const currency = String(event?.currency || "gbp").toUpperCase();
  const paid = orders.filter((o) => o.status === "paid");
  const refunded = orders.filter((o) => o.status === "refunded");
  const count = (status) => guests.filter((g) => g.status === status).length;

  const sections = [];

  sections.push([
    ["Event", event?.title ?? ""],
    ["Date", event?.date ?? ""],
    ["Venue", event?.venue_name ?? ""],
    ["Currency", currency],
    ["Exported at", new Date().toISOString()],
    [],
    ["Summary", ""],
    ["Tickets sold", paid.length],
    ["Tickets refunded", refunded.length],
    ["Total revenue", money(sum(paid, "paid_amount"))],
    ["Platform fees", money(sum(paid, "platform_fee"))],
    ["Promoter commissions", money(sum(paid, "commission_amount"))],
    ["Total discount given", money(sum(paid, "discount_amount") + sum(paid, "promoter_discount_amount"))],
    ["Net payout", money(sum(paid, "host_net"))],
    ["Guests on list", guests.length],
    ["Checked in", count("checked_in")],
    ["Approved", count("approved")],
    ["Invited", count("invited")],
    ["Requested", count("requested")],
    ["Waitlist", count("waitlist")],
    ["Denied", count("denied")],
    ["Revoked", count("revoked")],
  ]);

  sections.push([
    ["Tickets per tier"],
    ["Tier", "Price", "Quantity", "Sold", "Reserved", "Remaining", "Revenue"],
    ...tiers.map((t) => {
      const tierPaid = paid.filter((o) => o.tier_id === t.id);
      return [t.name, money(t.price), t.quantity, tierPaid.length, t.reserved ?? 0,
        tierRemaining(t), money(sum(tierPaid, "paid_amount"))];
    }),
  ]);

  sections.push([
    ["Promoters"],
    ["Name", "Email", "Code", "Status", "Clicks", "Tickets sold", "Total sales",
      "Commission owed", "Commission paid", "Discount uses", "Discount given"],
    ...promoters.map((p) => [p.name, p.email, p.tracking_code, p.status, p.clicks ?? 0,
      p.tickets_sold ?? 0, money(p.total_sales), money(p.commission_owed),
      money(p.commission_paid), p.discount_used_count ?? 0, money(p.discount_given)]),
  ]);

  sections.push([
    ["Promo codes"],
    ["Code", "Discount %", "Used", "Max uses", "Discount given", "Status"],
    ...promos.map((p) => [p.code, p.discount_percent, p.used_count ?? 0, p.max_uses,
      money(p.total_discount_given), p.status]),
  ]);

  const byDay = new Map();
  for (const o of paid) {
    const d = String(o.created_at || "").slice(0, 10);
    const day = byDay.get(d) || { tickets: 0, revenue: 0 };
    day.tickets += 1;
    day.revenue += Number(o.paid_amount) || 0;
    byDay.set(d, day);
  }
  let running = 0;
  sections.push([
    ["Sales by day"],
    ["Date", "Tickets", "Revenue", "Running revenue"],
    ...[...byDay.keys()].sort().map((d) => {
      const v = byDay.get(d);
      running += v.revenue;
      return [d, v.tickets, money(v.revenue), money(running)];
    }),
  ]);

  sections.push([
    ["Guests & tickets"],
    GUEST_COLUMNS,
    ...buildGuestRows({ guests, orders, promos }),
  ]);

  const rows = [];
  sections.forEach((s, i) => {
    if (i > 0) rows.push([]);
    rows.push(...s);
  });
  return toCsv(rows);
}

// Guests-only export for the guestlist page (no ticket-order join).
export function buildGuestlistCsv({ guests = [] }) {
  return toCsv([
    ["Name", "Email", "Phone", "Status", "Source", "Plus one", "Plus-one name",
      "Checked in at", "Checked out at", "Added at"],
    ...guests.map((g) => [g.guest_name, g.guest_email, g.guest_phone, g.status, g.source,
      yesNo(g.plus_one), g.plus_one_name, g.checked_in_at, g.checked_out_at, g.created_at]),
  ]);
}
