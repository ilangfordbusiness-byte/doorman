import { createClient } from "@supabase/supabase-js";
import { isNative, authStorage } from "@/lib/native";

// Local-stack defaults let `npm run dev` work against `supabase start` with no
// .env file. Production values come from Vercel env vars (web) or the
// .env used for the native build.
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || LOCAL_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || LOCAL_ANON_KEY,
  {
    auth: {
      // PKCE everywhere: the OAuth return carries a one-time ?code= instead
      // of tokens in the URL hash, which is what lets the native app finish
      // sign-in from a doorman://auth/callback deep link.
      flowType: "pkce",
      ...(isNative()
        ? {
          // Sessions live in Preferences (UserDefaults), not WebView storage
          // iOS may evict. Deep links are dispatched by useDeepLinks, so the
          // client must not try to read a code out of the page URL.
          storage: authStorage,
          detectSessionInUrl: false,
        }
        : {}),
    },
  },
);
