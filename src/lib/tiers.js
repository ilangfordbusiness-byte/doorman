// Ticket-tier availability as the buyer sees it. A tier's seats are either
// sold, held by a checkout that is still in progress (`reserved`), or free;
// only the free ones can be bought right now.
export function tierRemaining(tier) {
  const quantity = Number(tier?.quantity || 0);
  const sold = Number(tier?.sold || 0);
  const reserved = Number(tier?.reserved || 0);
  return Math.max(0, quantity - sold - reserved);
}

export function tierSoldOut(tier) {
  return tier?.sales_status !== "open" || tierRemaining(tier) <= 0;
}
