import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/api/data";
import { isBelowVersion } from "@/lib/appVersion";
import {
  getAppMarketingVersion,
  isNative,
  onAppStateChange,
  openInAppBrowser,
} from "@/lib/native";

const APP_STORE_URL = "https://apps.apple.com/app/id6821447175";

// iOS only. Blocks the app when the installed version is below the minimum in
// public.app_config. Any failure leaves the app usable: being offline or a
// failed read must never lock someone out of their guest pass.
export default function UpdateRequiredGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isNative()) return undefined;
    let cancelled = false;
    async function check() {
      try {
        const [installed, minimum] = await Promise.all([
          getAppMarketingVersion(),
          api.appConfig.iosMinVersion(),
        ]);
        if (!cancelled) setBlocked(isBelowVersion(installed, minimum));
      } catch (e) {
        console.warn("min version check failed", e);
      }
    }
    check();
    const stop = onAppStateChange((active) => {
      if (active) check();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  if (!blocked) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-black px-8 text-center text-white">
      <h1 className="text-xl font-semibold">Update DoorMan</h1>
      <p className="text-sm text-white/70">
        This version of the app is no longer supported. Update to keep using your passes and tickets.
      </p>
      <Button onClick={() => openInAppBrowser(APP_STORE_URL)}>Open the App Store</Button>
    </div>
  );
}
