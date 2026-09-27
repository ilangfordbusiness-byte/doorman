import { useEffect, useRef, useState } from "react";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/LoadingSpinner";
import { onBrowserFinished } from "@/lib/native";

// Shown in the iOS app while Stripe Checkout is open in the browser sheet.
// Polls the order we created until the webhook marks it paid. When the sheet
// closes without a paid order there is a short grace period (the webhook can
// lag the redirect), then the order is cancelled so its seats go back on
// sale — unless Stripe says the session was paid, in which case we keep
// waiting for the webhook. The deep link from /native/return usually
// navigates the page away before any of this matters; this is the fallback
// for a user who taps Done instead.
const POLL_MS = 2500;
const GRACE_POLLS = 6; // ~15 s after the sheet closes

export default function NativeCheckoutWait({ orderId, onPaid, onCancelled }) {
  const [sheetClosed, setSheetClosed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const closedPolls = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = null;

    async function cancelOrder() {
      if (done.current) return;
      setCancelling(true);
      try {
        const res = await api.functions.invoke("cancelTicketCheckout", { order_id: orderId });
        if (res.data?.status === "paid_pending_webhook") {
          // Stripe took the payment; the webhook will flip the order. Keep polling.
          setCancelling(false);
          closedPolls.current = -Infinity;
          schedule();
          return;
        }
      } catch { /* treat as cancelled locally; the expiry sweep tidies the row */ }
      if (active && !done.current) { done.current = true; onCancelled(); }
    }

    async function tick() {
      if (!active || done.current) return;
      const orders = await api.entities.TicketOrder.filter({ id: orderId }).catch(() => []);
      const order = orders[0];
      if (order?.status === "paid") { done.current = true; onPaid(order); return; }
      if (order && order.status !== "pending") { done.current = true; onCancelled(); return; }
      if (sheetClosed) {
        closedPolls.current += 1;
        if (closedPolls.current >= GRACE_POLLS) { await cancelOrder(); return; }
      }
      schedule();
    }

    function schedule() {
      if (!active || done.current) return;
      timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderId, sheetClosed, onPaid, onCancelled]);

  useEffect(() => onBrowserFinished(() => setSheetClosed(true)), []);

  async function giveUp() {
    if (done.current) return;
    setCancelling(true);
    try {
      const res = await api.functions.invoke("cancelTicketCheckout", { order_id: orderId });
      if (res.data?.status === "paid_pending_webhook") { setCancelling(false); return; }
    } catch { /* fall through */ }
    done.current = true;
    onCancelled();
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <LoadingSpinner />
      <p className="text-sm text-muted-foreground mt-4">
        {cancelling ? "Releasing your seats…" : sheetClosed ? "Confirming payment…" : "Finish paying in the secure Stripe window."}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {sheetClosed ? "This takes a few seconds." : "Your tickets are held while you pay."}
      </p>
      {sheetClosed && !cancelling && (
        <Button variant="outline" className="mt-8 h-11 rounded-xl" onClick={giveUp}>
          I didn't pay — release my seats
        </Button>
      )}
    </div>
  );
}
