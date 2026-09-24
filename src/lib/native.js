import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { PushNotifications } from "@capacitor/push-notifications";

// The one module that talks to Capacitor. Pages, hooks and the data layer
// import from here and never from @capacitor/* directly — the same rule that
// keeps Supabase behind src/api/data.js. Every export is safe to call on the
// web: it either falls back to the browser API or is a no-op.

export function isNative() {
  return Capacitor.isNativePlatform();
}

// Custom URL scheme the native app owns (Info.plist CFBundleURLSchemes).
// OAuth providers redirect here after sign-in; the browser sheet cannot land
// on capacitor://localhost, and universal links do not fire from redirects.
export const NATIVE_SCHEME = "doorman";
export const NATIVE_AUTH_CALLBACK = `${NATIVE_SCHEME}://auth/callback`;
export const NATIVE_OPEN_PREFIX = `${NATIVE_SCHEME}://open`;

// Build a doorman://open?to=<path> link that returns from a browser sheet
// (Stripe, Connect onboarding) to an in-app path.
export function nativeOpenLink(path) {
  return `${NATIVE_OPEN_PREFIX}?to=${encodeURIComponent(path || "/")}`;
}

// Supabase auth storage backed by Preferences (UserDefaults) rather than the
// WebView's localStorage, which iOS may evict under storage pressure.
export const authStorage = {
  async getItem(key) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async setItem(key, value) {
    await Preferences.set({ key, value });
  },
  async removeItem(key) {
    await Preferences.remove({ key });
  },
};

// --- In-app browser (SFSafariViewController) --------------------------------

export async function openInAppBrowser(url) {
  if (!isNative()) {
    window.location.href = url;
    return;
  }
  await Browser.open({ url, presentationStyle: "popover" });
}

export async function closeInAppBrowser() {
  if (!isNative()) return;
  try {
    await Browser.close();
  } catch {
    // Already closed (the user tapped Done) — nothing to do.
  }
}

// cb() fires when the sheet is dismissed, by us or by the user. Returns unsub.
export function onBrowserFinished(cb) {
  if (!isNative()) return () => {};
  const handle = Browser.addListener("browserFinished", () => cb());
  return () => { handle.then((h) => h.remove()); };
}

// --- App lifecycle / deep links --------------------------------------------

// cb(url) for every URL the OS hands the running app: custom scheme and
// universal links alike. Returns unsub.
export function onAppUrlOpen(cb) {
  if (!isNative()) return () => {};
  const handle = App.addListener("appUrlOpen", (e) => cb(e.url));
  return () => { handle.then((h) => h.remove()); };
}

// The URL that launched the app from cold, if any.
export async function getLaunchUrl() {
  if (!isNative()) return null;
  try {
    const res = await App.getLaunchUrl();
    return res?.url || null;
  } catch {
    return null;
  }
}

// cb(isActive) on foreground/background transitions. Returns unsub.
export function onAppStateChange(cb) {
  if (!isNative()) return () => {};
  const handle = App.addListener("appStateChange", (s) => cb(!!s.isActive));
  return () => { handle.then((h) => h.remove()); };
}

// --- Sign in with Apple -----------------------------------------------------

function randomNonce(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Runs the native Apple sign-in sheet. Apple receives the SHA-256 of the
// nonce and embeds it in the identity token; Supabase must be handed the raw
// nonce to verify that binding. Apple only returns the name on the very first
// authorisation for this app, so callers treat it as optional.
export async function appleAuthorize() {
  if (!isNative()) throw new Error("Sign in with Apple is only available in the iOS app.");
  const rawNonce = randomNonce();
  const { response } = await SignInWithApple.authorize({
    clientId: "com.thedoorman.app",
    // Required by the plugin's options type; only used by its web/Android
    // flows, which this app does not ship.
    redirectURI: "https://thedoorman.app/auth/apple",
    scopes: "email name",
    nonce: await sha256Hex(rawNonce),
  });
  if (!response?.identityToken) throw new Error("Apple sign-in was cancelled.");
  return {
    identityToken: response.identityToken,
    rawNonce,
    givenName: response.givenName || "",
    familyName: response.familyName || "",
    email: response.email || "",
  };
}

// --- Push notifications (APNs) ---------------------------------------------

// "1.2.0 (14)" — stored with the device token so stale builds are visible.
export async function getAppVersion() {
  if (!isNative()) return null;
  try {
    const info = await App.getInfo();
    return `${info.version} (${info.build})`;
  } catch {
    return null;
  }
}

// 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
export async function pushPermission() {
  if (!isNative()) return "denied";
  return (await PushNotifications.checkPermissions()).receive;
}

export async function requestPushPermission() {
  if (!isNative()) return "denied";
  return (await PushNotifications.requestPermissions()).receive;
}

// Asks iOS for a device token. onToken(hexToken) fires once registration
// completes (and again if the OS rotates the token). Returns a cleanup that
// removes both listeners.
export async function registerPush({ onToken, onError }) {
  if (!isNative()) return () => {};
  const a = await PushNotifications.addListener("registration", (t) => onToken(t.value));
  const b = await PushNotifications.addListener("registrationError", (e) => onError?.(e));
  await PushNotifications.register();
  return () => { a.remove(); b.remove(); };
}

// cb(url) when the user taps a notification; url is the in-app path the
// sender put at the top level of the payload. Returns unsub.
export function onPushTapped(cb) {
  if (!isNative()) return () => {};
  const handle = PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const data = a?.notification?.data || {};
    cb(data.url ?? data.data?.url ?? null);
  });
  return () => { handle.then((h) => h.remove()); };
}

// cb(notification) when a push arrives while the app is in the foreground.
export function onPushReceived(cb) {
  if (!isNative()) return () => {};
  const handle = PushNotifications.addListener("pushNotificationReceived", (n) => cb(n));
  return () => { handle.then((h) => h.remove()); };
}

// --- Shell chrome -----------------------------------------------------------

export async function hideSplash() {
  if (!isNative()) return;
  try { await SplashScreen.hide({ fadeOutDuration: 200 }); } catch { /* ignore */ }
}

// Called once before the first render (main.jsx). Marks the document so CSS
// can pad for the status bar (html.native) and sets light status-bar text on
// the app's black background.
export async function initNativeShell() {
  if (!isNative()) return;
  document.documentElement.classList.add("native");
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch { /* status bar plugin unavailable */ }
}
