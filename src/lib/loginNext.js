import { toAppPath } from "@/lib/appUrl";

// Where to land after signing in. api.auth.redirectToLogin() stores the page
// the user was heading for (e.g. a shared /pass or /event/...?ref= link) in
// sessionStorage under this key. In-app paths only: anything else is ignored.
// Shared by the sign-in screen (email, Apple) and the iOS OAuth callback
// (useDeepLinks), so every sign-in method returns to the same page.
const KEY = "login_next";

// The stored target as an in-app path ("/event/1?ref=x"), or null. Leaves it in place.
export function peekLoginNextPath() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? toAppPath(raw) : null;
  } catch {
    return null;
  }
}

// The stored target as an in-app path, removed so it is used once.
export function takeLoginNextPath() {
  const path = peekLoginNextPath();
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  return path;
}
