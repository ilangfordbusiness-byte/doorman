import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Service-role client: bypasses RLS. Env vars are auto-injected by the edge runtime.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// Resolve the calling user (profile row) from the request's JWT, or null.
// The functions gateway has already verified the JWT signature for every
// function with verify_jwt=true (all callers of this helper), so decoding the
// payload for `sub` is safe here; do NOT use this in a verify_jwt=false function.
// deno-lint-ignore no-explicit-any
export async function getCaller(req: Request, svc: SupabaseClient): Promise<any | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  let sub: string | undefined;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0)),
      ),
    );
    sub = payload.sub;
  } catch {
    return null;
  }
  if (!sub) return null;
  const { data: profile, error } = await svc.from('profiles').select('*').eq('id', sub).single();
  if (error) console.log('getCaller profile fetch failed:', error.message);
  return profile ?? null;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Preflight response, or null if this isn't a preflight.
export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

// Shared-secret gate for automation endpoints (db triggers, cron).
export function hasAutomationSecret(req: Request): boolean {
  const secret = Deno.env.get('AUTOMATION_SECRET') || '';
  return secret.length > 0 && req.headers.get('x-automation-secret') === secret;
}

export function randomSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
