import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { useAuth } from "@/lib/AuthContext";
import { getImpersonation } from "@/lib/impersonation";
import { queryClientInstance } from "@/lib/query-client";
import {
  isNative, pushPermission, requestPushPermission, registerPush, getAppVersion,
  onPushTapped, onPushReceived,
} from "@/lib/native";

// iOS push registration. Runs once a session exists (never on the login
// screen, so the permission prompt has context), asks for permission when
// undecided, then hands the APNs token to register_push_device. Skipped while
// an admin is impersonating someone — that phone belongs to the admin. Taps
// navigate to the path the sender put in the payload; foreground pushes
// refresh the notification badges. No-op on the web. Mount inside the Router.
export function usePushRegistration() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative() || !isAuthenticated || !user?.id || getImpersonation()) return;
    let cancelled = false;
    let cleanup = null;
    (async () => {
      try {
        let perm = await pushPermission();
        if (perm === "prompt" || perm === "prompt-with-rationale") perm = await requestPushPermission();
        if (perm !== "granted" || cancelled) return;
        const appVersion = await getAppVersion();
        cleanup = await registerPush({
          onToken: (token) =>
            api.push.register(token, "ios", appVersion).catch((e) => console.warn("push register failed", e)),
          onError: (e) => console.warn("push registration error", e),
        });
      } catch (e) {
        console.warn("push setup failed", e);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isNative()) return;
    const offTap = onPushTapped((url) => {
      if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) navigate(url);
    });
    const offReceived = onPushReceived(() => {
      queryClientInstance.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => { offTap(); offReceived(); };
  }, [navigate]);
}
