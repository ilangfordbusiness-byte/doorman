// Host-only CRUD for ticket tiers and promo codes. Prices arrive in major
// units from the UI and are stored as minor units.
import { getCaller, json, preflight, serviceClient } from '../_shared/db.ts';
import { PAYOUT_SETUP_ERROR, resolvePayoutAccount } from '../_shared/connect.ts';

// Optional scheduled release. `undefined` = field absent, `null`/'' = clear the
// schedule (on sale now), string = ISO timestamp. Returns the normalised value
// or an error message.
function parseReleaseAt(raw: unknown): { value?: string | null; error?: string } {
  if (raw === undefined) return {};
  if (raw === null || raw === '') return { value: null };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { error: 'Invalid release time' };
  return { value: d.toISOString() };
}

// Optional per-tier blurb shown to guests. Mirrors the database check
// constraint so the host gets a friendly error instead of a constraint name.
const DESCRIPTION_MAX = 280;
function normalizeDescription(raw: unknown): { value: string | null; error?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null };
  if (text.length > DESCRIPTION_MAX) {
    return { value: null, error: `Tier description must be ${DESCRIPTION_MAX} characters or fewer` };
  }
  return { value: text };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const svc = serviceClient();
    const user = await getCaller(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action } = body;

    let eventId: string | undefined = body.event_id;
    if ((action === 'delete_tier' || action === 'update_tier' || action === 'delete_promo') && !eventId && body.id) {
      const table = action === 'delete_promo' ? 'promo_codes' : 'ticket_tiers';
      const { data: rec } = await svc.from(table).select('event_id').eq('id', body.id).single();
      eventId = rec?.event_id;
    }
    if (!eventId) return json({ error: 'Missing event_id' }, 400);

    const { data: evt } = await svc.from('events').select('id, host_id, business_id')
      .eq('id', eventId).single();
    if (!evt) return json({ error: 'Event not found' }, 404);
    // The host, or — for a business event — the business owner or an accepted
    // team member, may manage the ticket catalog (full host parity).
    let allowed = evt.host_id === user.id;
    if (!allowed && evt.business_id) {
      const { data: biz } = await svc.from('business_accounts')
        .select('owner_id').eq('id', evt.business_id).maybeSingle();
      allowed = biz?.owner_id === user.id;
      if (!allowed) {
        const { count } = await svc.from('business_members')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', evt.business_id).eq('status', 'accepted')
          .or(`user_id.eq.${user.id},email.eq.${user.email}`);
        allowed = (count ?? 0) > 0;
      }
    }
    if (!allowed) {
      return json({ error: 'Only the event host or business team can manage the ticket catalog' }, 403);
    }

    if (action === 'create_tier') {
      const { name, price, quantity } = body;
      if (!name || price == null || quantity == null) {
        return json({ error: 'Missing tier fields' }, 400);
      }
      // Selling tickets requires payout-ready Stripe onboarding — the host's
      // share is auto-routed at purchase, so there is no platform-held path.
      const payout = await resolvePayoutAccount(svc, evt);
      if (!payout.active) return json({ error: PAYOUT_SETUP_ERROR }, 400);
      const description = normalizeDescription(body.description);
      if (description.error) return json({ error: description.error }, 400);
      const release = parseReleaseAt(body.release_at);
      if (release.error) return json({ error: release.error }, 400);
      const { data: tier, error } = await svc.from('ticket_tiers').insert({
        event_id: eventId,
        name,
        description: description.value,
        price_minor: Math.round(Number(price) * 100),
        quantity: Math.round(Number(quantity)),
        sort_order: body.sort_order ?? 0,
        hide_remaining: !!body.hide_remaining,
        // Scheduled release: visible to guests but not buyable until then.
        release_at: release.value ?? null,
      }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ tier });
    }

    if (action === 'update_tier') {
      if (!body.id) return json({ error: 'Missing tier id' }, 400);
      // Editable fields: name, description, the remaining-count display flag, and sales_status —
      // a host can manually end a tier ('closed') or reopen it ('open')
      // regardless of how many tickets are left. 'closed' (not 'sold_out') is
      // used for manual ends so a later refund doesn't auto-reopen it.
      const patch: Record<string, unknown> = {};
      if ('name' in body) {
        // A tier can be renamed at any time, even after tickets have sold.
        const nm = String(body.name ?? '').trim();
        if (!nm) return json({ error: 'Tier name required' }, 400);
        patch.name = nm;
      }
      if ('description' in body) {
        // Blank clears the description (it is optional).
        const description = normalizeDescription(body.description);
        if (description.error) return json({ error: description.error }, 400);
        patch.description = description.value;
      }
      if ('hide_remaining' in body) patch.hide_remaining = !!body.hide_remaining;
      if ('release_at' in body) {
        // Schedule, move, or clear (null) a tier's release. A past value is
        // allowed and simply means "on sale now", the same as clearing it.
        const release = parseReleaseAt(body.release_at);
        if (release.error) return json({ error: release.error }, 400);
        patch.release_at = release.value;
      }
      if ('sales_status' in body) {
        if (!['open', 'closed', 'sold_out'].includes(body.sales_status)) {
          return json({ error: 'Invalid sales_status' }, 400);
        }
        patch.sales_status = body.sales_status;
      }
      if ('quantity' in body) {
        // Hosts can resize a live tier. It can never drop below what's already
        // committed (sold + reserved) — the DB constraint (sold + reserved <=
        // quantity) would reject it and it would mean overselling.
        const qty = Number(body.quantity);
        if (!Number.isInteger(qty) || qty < 0) {
          return json({ error: 'Quantity must be a whole number of 0 or more' }, 400);
        }
        const { data: cur } = await svc.from('ticket_tiers')
          .select('sold, reserved, sales_status').eq('id', body.id).eq('event_id', eventId).single();
        const committed = Number(cur?.sold ?? 0) + Number(cur?.reserved ?? 0);
        if (qty < committed) {
          return json({ error: `Can't set below ${committed} — that many are already sold or in checkout.` }, 400);
        }
        patch.quantity = qty;
        // Adding capacity to an auto- sold-out tier reopens it (mirrors the
        // refund auto-reopen); a manual 'closed' end is left untouched.
        if (!('sales_status' in body) && cur?.sales_status === 'sold_out' && qty > committed) {
          patch.sales_status = 'open';
        }
      }
      if (Object.keys(patch).length === 0) return json({ error: 'Nothing to update' }, 400);
      const { data: tier, error } = await svc.from('ticket_tiers')
        .update(patch)
        .eq('id', body.id).eq('event_id', eventId)
        .select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ tier });
    }

    if (action === 'delete_tier') {
      const { error } = await svc.from('ticket_tiers').delete().eq('id', body.id);
      if (error) {
        // A tier with orders can't be deleted — the FK (on delete restrict)
        // protects the order/payment history behind its sold tickets.
        if (error.code === '23503') {
          return json({ error: "This tier already has sold tickets, so it can't be deleted." }, 400);
        }
        return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    if (action === 'create_promo') {
      const { code, discount_percent, max_uses } = body;
      if (!code || discount_percent == null || max_uses == null) {
        return json({ error: 'Missing promo fields' }, 400);
      }
      const { data: promo, error } = await svc.from('promo_codes').insert({
        event_id: eventId,
        code: String(code).trim().toUpperCase(),
        discount_percent: Number(discount_percent),
        max_uses: Math.round(Number(max_uses)),
        created_by: user.id,
      }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      return json({ promo });
    }

    if (action === 'delete_promo') {
      const { error } = await svc.from('promo_codes').delete().eq('id', body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('manageTicketCatalog error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
