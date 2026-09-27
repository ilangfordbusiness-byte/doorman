import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";

// Landing page for the "Unsubscribe" link in every DoorMan email. The link
// carries the address (e, base64url) and an HMAC token (t) that the
// unsubscribeEmail function verifies, so this works with no session and for
// guests who never made an account. Rendered outside the auth gate in App.jsx.
// It asks for a click rather than opting out on load: link scanners pre-fetch
// URLs in email, and a GET must never change anything.
function readParams(search) {
  const params = new URLSearchParams(search);
  return { e: params.get("e") || "", t: params.get("t") || "" };
}

function decodeEmail(e) {
  try {
    return atob(e.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}

export default function Unsubscribe() {
  const { search } = useLocation();
  const { e, t } = readParams(search);
  const email = decodeEmail(e);
  const valid = email.includes("@") && !!t;

  // null = not yet known; true/false = current state of the opt-out list.
  const [unsubscribed, setUnsubscribed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(valid ? "" : "This link is missing its code. Open the email again and use the button in it.");

  const call = async (action) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.functions.invoke("unsubscribeEmail", { e, t, action });
      setUnsubscribed(!!data?.unsubscribed);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (valid) call("status");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, t]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="DoorMan" className="w-14 h-14 mx-auto mb-6 object-contain" />
        {error ? (
          <>
            <h1 className="text-xl font-extrabold mb-1">Link not valid</h1>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button className="w-full h-12 rounded-xl font-semibold" onClick={() => window.location.replace("/")}>
              Go to DoorMan
            </Button>
          </>
        ) : unsubscribed === null ? (
          <>
            <div className="w-8 h-8 mx-auto mb-4 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
            <p className="text-sm text-muted-foreground">One moment…</p>
          </>
        ) : unsubscribed ? (
          <>
            <h1 className="text-xl font-extrabold mb-1">You're unsubscribed</h1>
            <p className="text-sm text-muted-foreground mb-6">
              <span className="font-medium text-foreground">{email}</span> will no longer get event
              updates, reminders, host messages or the weekly digest from DoorMan. Tickets you buy
              and transfers sent to you are still emailed.
            </p>
            <Button variant="outline" className="w-full h-12 rounded-xl font-semibold" disabled={busy}
              onClick={() => call("resubscribe")}>
              {busy ? "Updating…" : "Resubscribe"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold mb-1">Unsubscribe from notifications?</h1>
            <p className="text-sm text-muted-foreground mb-6">
              <span className="font-medium text-foreground">{email}</span> will stop getting event
              updates, reminders, host messages and the weekly digest. Tickets you buy and transfers
              sent to you are still emailed.
            </p>
            <Button className="w-full h-12 rounded-xl font-semibold" disabled={busy}
              onClick={() => call("unsubscribe")}>
              {busy ? "Updating…" : "Unsubscribe"}
            </Button>
            <button type="button" className="mt-4 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => window.location.replace("/")}>
              Keep my emails
            </button>
          </>
        )}
      </div>
    </div>
  );
}
