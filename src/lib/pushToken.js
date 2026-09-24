// The APNs token this device registered under the current user. Kept in
// localStorage (not sessionStorage) so a logout right after a cold start can
// still find it before the OS has re-issued one; every launch re-registers
// anyway, which also refreshes push_devices.last_seen_at.
const KEY = "dm_push_token";
let memo = null;

export function getStoredPushToken() {
  if (memo) return memo;
  try { memo = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  return memo;
}

export function setStoredPushToken(token) {
  memo = token || null;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

export function clearStoredPushToken() {
  setStoredPushToken(null);
}
