import { createClient } from "@supabase/supabase-js";

// Local-stack defaults let `npm run dev` work against `supabase start` with no
// .env file. Production values come from Vercel env vars.
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || LOCAL_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || LOCAL_ANON_KEY,
);
