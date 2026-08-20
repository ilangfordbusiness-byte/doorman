import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Returns the business's Stripe Connect connection status (separate from personal).
export function useBusinessStripeStatus(businessId) {
  const [connected, setConnected] = useState(null);
  useEffect(() => {
    if (!businessId) { setConnected(null); return; }
    let mounted = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("stripeConnect", { action: "business_status", business_id: businessId });
        if (mounted) setConnected(!!res.data?.account?.id);
      } catch {
        if (mounted) setConnected(false);
      }
    })();
    return () => { mounted = false; };
  }, [businessId]);
  return { connected };
}