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
// The launch URL is remembered per WebView session: Capacitor reports the URL
// that last opened the app even after the page reloads (logout, /auth/confirm's
// location.replace), which would replay a one-time link — e.g. re-verify an
// already consumed recovery token — on every boot.
const HANDLED_KEY = "dm_handled_launch_url";

export function useDeepLinks() {
  const navigate = useNavigate();
  const lastHandled = useRef(null);

  useEffect(() => {
    if (!isNative()) return;

    async function handle(url, { fromLaunch = false } = {}) {
      if (!url || url === lastHandled.current) return;
      if (fromLaunch) {
        try {
          if (sessionStorage.getItem(HANDLED_KEY) === url) return;
        } catch { /* storage unavailable */ }
      }
      lastHandled.current = url;
      try { sessionStorage.setItem(HANDLED_KEY, url); } catch { /* storage unavailable */ }

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

    getLaunchUrl().then((u) => { if (u) handle(u, { fromLaunch: true }); });
    return onAppUrlOpen(handle);
  }, [navigate]);
}
