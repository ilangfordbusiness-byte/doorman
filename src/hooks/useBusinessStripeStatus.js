import { useState, useEffect } from "react";
import { api } from "@/api/data";

// Returns the business's Stripe Connect connection status (separate from personal).
// connected: account exists; active: payouts enabled (required to sell tickets).
export function useBusinessStripeStatus(businessId) {
  const [connected, setConnected] = useState(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!businessId) { setConnected(null); setActive(false); return; }
    let mounted = true;
    (async () => {
      try {
        const res = await api.functions.invoke("stripeConnect", { action: "business_status", business_id: businessId });
        if (mounted) {
          setConnected(!!res.data?.account?.id);
          setActive(!!res.data?.account?.payouts_enabled);
        }
      } catch {
        if (mounted) setConnected(false);
      }
    })();
    return () => { mounted = false; };
  }, [businessId]);
  return { connected, active };
}