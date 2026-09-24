import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNative, nativeOpenLink } from "@/lib/native";
import { toAppPath } from "@/lib/appUrl";

// Landing page for redirects that happen inside the iOS app's browser sheet
// (Stripe Checkout, Stripe Connect onboarding). Stripe redirects the sheet to
// https://thedoorman.app/native/return?to=<in-app path>[&status=…][&order=…];
// this page hands the user back to the app through its doorman:// URL scheme.
// iOS does not open universal links for server-side redirects, so the tap on
// the button is the guaranteed path; the automatic redirect is a shortcut.
// Rendered outside the auth gate — the sheet has no session of its own.
export default function NativeReturn() {
  const { search } = useLocation();
  const navigate = useNavigate();

  const { path, status } = useMemo(() => {
    const params = new URLSearchParams(search);
    let to = toAppPath(params.get("to") || "/") || "/";
    // createTicketCheckout appends order=<id> to the outer URL; carry it into
    // the in-app path so the checkout page knows which order to show/cancel.
    const order = params.get("order");
    if (order && !/[?&]order=/.test(to)) to += `${to.includes("?") ? "&" : "?"}order=${encodeURIComponent(order)}`;
    return { path: to, status: params.get("status") || "" };
  }, [search]);

  const link = nativeOpenLink(path);

  useEffect(() => {
    // Reached inside the app itself (a universal link did open it): just go.
    if (isNative()) { navigate(path, { replace: true }); return; }
    try { window.location.href = link; } catch { /* the button remains */ }
  }, [link, path, navigate]);

  const cancelled = status === "cancelled";
  const Icon = cancelled ? XCircle : CheckCircle2;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <Icon className={`w-12 h-12 mx-auto mb-4 ${cancelled ? "text-destructive" : "text-emerald-400"}`} />
        <h1 className="text-xl font-extrabold mb-1">
          {cancelled ? "Payment cancelled" : status === "success" ? "Payment complete" : "All done"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {cancelled ? "You weren't charged." : "You can head back to DoorMan now."}
        </p>
        <Button asChild className="w-full h-12 rounded-xl font-semibold gap-2">
          <a href={link}>Return to DoorMan <ArrowRight className="w-4 h-4" /></a>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          If nothing happens, close this window to get back to the app.
        </p>
      </div>
    </div>
  );
}
