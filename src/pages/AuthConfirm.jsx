import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/api/data";
import { toAppPath } from "@/lib/appUrl";
import { Button } from "@/components/ui/button";

// Landing page for auth email links (sign-up confirmation, password reset,
// email change). The email carries ?type=…&token_hash=…[&next=…]; verifying the
// hash here signs the user in. Rendered outside the auth gate so it works with
// no session. Keeping the link on our own domain (not *.supabase.co) is what
// keeps these emails out of junk, and a page with a real request means link
// scanners that pre-fetch URLs cannot burn the one-time token before the user
// gets to it.
const TYPES = new Set(["signup", "recovery", "email_change", "magiclink", "invite", "email"]);

// `next` is the page the user signed up from (Supabase URL-encodes
// {{ .RedirectTo }} when it renders the template).
function readParams(search) {
  const params = new URLSearchParams(search);
  return {
    type: params.get("type") || "",
    tokenHash: params.get("token_hash") || "",
    next: params.get("next") || "",
  };
}

// Only ever redirect within the app: the current origin or the public site
// (auth emails always carry the site URL, which the iOS app also handles).
function safeNext(next) {
  return toAppPath(next) || "/";
}

export default function AuthConfirm() {
  const [error, setError] = useState("");
  // Read from the router, not window.location, so a deep link that arrives
  // while the app is already running still triggers the verification.
  const { search } = useLocation();

  useEffect(() => {
    const { type, tokenHash, next } = readParams(search);
    if (!TYPES.has(type) || !tokenHash) {
      setError("This link is missing its code. Open the email again and use the button in it.");
      return;
    }
    api.auth.verifyEmailToken(tokenHash, type)
      .then(() => {
        const dest = type === "recovery" ? "/reset-password" : safeNext(next);
        window.location.replace(dest);
      })
      .catch((e) => {
        const msg = String(e?.message || "");
        setError(/expired|invalid|not found/i.test(msg)
          ? "This link has expired or was already used. Sign in, or request a new one."
          : msg || "Could not confirm this link.");
      });
  }, [search]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="DoorMan" className="w-14 h-14 mx-auto mb-6 object-contain" />
        {error ? (
          <>
            <h1 className="text-xl font-extrabold mb-1">Link not valid</h1>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button className="w-full h-12 rounded-xl font-semibold"
              onClick={() => window.location.replace("/")}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 mx-auto mb-4 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
            <p className="text-sm text-muted-foreground">Confirming your email…</p>
          </>
        )}
      </div>
    </div>
  );
}
