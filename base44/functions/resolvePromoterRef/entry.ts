import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Public resolver for promoter tracking links. Guests opening a promoter link
// cannot read the Promoter table directly (RLS), so this service-role function
// validates the code and returns only the public fields needed to show the
// auto-applied discount. Optionally counts a click (once per guest session,
// gated client-side).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event_id, code, count_click } = await req.json();
    if (!event_id || !code) return Response.json({ valid: false });

    const promoters = await base44.asServiceRole.entities.Promoter.filter({
      event_id,
      tracking_code: String(code).trim(),
    });
    const promoter = promoters[0];
    if (!promoter || promoter.status !== 'active') return Response.json({ valid: false });

    if (count_click) {
      try {
        await base44.asServiceRole.entities.Promoter.update(promoter.id, {
          clicks: Number(promoter.clicks || 0) + 1,
        });
      } catch (e) {
        console.log('resolvePromoterRef click increment error', e?.message || String(e));
      }
    }

    return Response.json({
      valid: true,
      promoter: {
        tracking_code: promoter.tracking_code,
        name: promoter.name,
        discount_type: promoter.discount_type || 'none',
        discount_value: Number(promoter.discount_value || 0),
        discount_max_uses: Number(promoter.discount_max_uses || 0),
        discount_used_count: Number(promoter.discount_used_count || 0),
      },
    });
  } catch (error) {
    console.log('resolvePromoterRef error', error.message);
    return Response.json({ valid: false });
  }
});