import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import {
  isNative, getLaunchUrl, onAppUrlOpen, closeInAppBrowser,
  NATIVE_AUTH_CALLBACK, NATIVE_OPEN_PREFIX,
} from "@/lib/native";
import { toAppPath } from "@/lib/appUrl";
import { stashRefFromUrl } from "@/lib/promoterRef";

// Routes URLs the OS hands the native app into the SPA. Three shapes:
//   doorman://auth/callback?code=…   OAuth return from the browser sheet
//   doorman://open?to=/path          "back to the app" links from web pages
//                                    shown in the sheet (Stripe returns)
//   https://thedoorman.app/path      universal links (shared event/invite/pass
//                                    links, auth emails, password reset)
// Must be mounted inside the Router. No-op on the web.
export function useDeepLinks() {
  const navigate = useNavigate();
  const lastHandled = useRef(null);

  useEffect(() => {
    if (!isNative()) return;

    async function handle(url) {
      if (!url || url === lastHandled.current) return;
      lastHandled.current = url;

      if (url.startsWith(NATIVE_AUTH_CALLBACK)) {
        try {
          await api.auth.completeOAuthCallback(url);
        } catch (e) {
          const q = new URLSearchParams({
            error: "oauth_failed",
            error_description: e?.message || "Sign-in failed. Please try again.",
          });
          navigate(`/?${q}`, { replace: true });
        } finally {
          closeInAppBrowser();
        }
        return;
      }

      if (url.startsWith(NATIVE_OPEN_PREFIX)) {
        closeInAppBrowser();
        let to = "/";
        try { to = new URL(url).searchParams.get("to") || "/"; } catch { /* keep "/" */ }
        const path = toAppPath(to);
        if (path) navigate(path);
        return;
      }

      // Universal link: keep promoter attribution, then navigate in place.
      stashRefFromUrl(url);
      const path = toAppPath(url);
      if (path) navigate(path);
    }

    getLaunchUrl().then((u) => { if (u) handle(u); });
    return onAppUrlOpen(handle);
  }, [navigate]);
}
