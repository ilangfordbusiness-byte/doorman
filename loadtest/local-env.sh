# Source this to point the load tests at the local Supabase stack:
#   source loadtest/local-env.sh
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export LT_SUPABASE_URL="$API_URL"
export LT_ANON_KEY="$ANON_KEY"
export LT_SERVICE_KEY="$SERVICE_ROLE_KEY"
_lt_env="supabase/functions/.env.local"; [ -f "$_lt_env" ] || _lt_env="../supabase/functions/.env.local"
export LT_WEBHOOK_SECRET="$(sed -n 's/^STRIPE_TEST_WEBHOOK_SECRET=//p' "$_lt_env")"
export LT_STRIPE_ACCOUNT="${LT_STRIPE_ACCOUNT:-}"
echo "load tests -> $LT_SUPABASE_URL"
