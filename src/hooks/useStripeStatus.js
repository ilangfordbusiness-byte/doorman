import { useState, useEffect } from "react";
import { api } from "@/api/data";

// Returns the current user's Stripe Connect status.
// connected: null while loading, then true/false
export function useStripeStatus() {
  const [connected, setConnected] = useState(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.functions.invoke("stripeConnect", { action: "status" });
        if (mounted) {
          setConnected(!!res.data?.account?.id);
          setActive(!!res.data?.account?.payouts_enabled);
        }
      } catch {
        if (mounted) setConnected(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { connected, active };
}