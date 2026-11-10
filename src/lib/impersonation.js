import { supabase } from "@/api/client";
import { api } from "@/api/data";

// "Act as user" (super-admin only). We save the admin's current session, mint a
// session as the target via an admin-generated magic-link token, and swap into
// it. Exit restores the saved admin session. State lives in sessionStorage so a
// page reload during impersonation still shows the banner and can exit.
const KEY = "dm_impersonation";

export function getImpersonation() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Begin acting as `user` ({ id, full_name, email }). Reloads the app as them.
export async function startImpersonation(user) {
  // Save the admin session so we can restore it on exit.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");

  const { email, token_hash } = await api.admin.impersonate(user.id);
  if (!token_hash) throw new Error("Could not start impersonation");

  // Stash BEFORE swapping the session (swap overwrites the stored auth token).
  sessionStorage.setItem(KEY, JSON.stringify({
    admin: { access_token: session.access_token, refresh_token: session.refresh_token },
    targetName: user.full_name || email,
    targetEmail: email,
  }));

  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash });
  if (error) {
    sessionStorage.removeItem(KEY);
    throw new Error(error.message || "Could not start impersonation");
  }
  // Full reload boots the app cleanly as the target user.
  window.location.assign("/");
}

// Restore the admin session and return to the admin panel.
export async function exitImpersonation() {
  const state = getImpersonation();
  sessionStorage.removeItem(KEY);
  let restored = false;
  if (state?.admin?.refresh_token) {
    try {
      // setSession reports failure (e.g. a refresh token that was already
      // used) in `error`; it does not throw.
      const { error } = await supabase.auth.setSession({
        access_token: state.admin.access_token,
        refresh_token: state.admin.refresh_token,
      });
      restored = !error;
    } catch { /* treated as not restored */ }
  }
  if (!restored) {
    // Never stay signed in as the target with the banner gone. This matters
    // more now that a regular admin can be the target: /admin would still
    // open, as them. Sign out (this device only) so the admin signs back in.
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
    window.location.assign("/");
    return;
  }
  window.location.assign("/admin");
}
