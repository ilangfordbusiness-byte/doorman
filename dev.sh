#!/usr/bin/env bash
# DoorMan local dev — one command for the whole stack.
#
#   ./dev.sh          start Supabase + edge functions + vite (Ctrl+C stops everything)
#   ./dev.sh reset    same, but wipe and re-apply all migrations first
#   ./dev.sh test     run the three SQL test suites and exit
#
# Requires: Docker running, supabase CLI, npm install already done.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=supabase/functions/.env.local
DEMO_EMAIL=demo@doorman.dev
DEMO_PASSWORD=demopass123

say()  { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null || fail "supabase CLI not found (brew install supabase/tap/supabase)"
docker info >/dev/null 2>&1    || fail "Docker isn't running — start Docker Desktop first"

# --- Supabase stack -----------------------------------------------------------
if supabase status >/dev/null 2>&1; then
  say "Supabase stack already running"
else
  say "Starting Supabase stack (first run takes a while)…"
  supabase start
fi

if [ "${1:-}" = "reset" ]; then
  say "Resetting database (re-applying all migrations)…"
  supabase db reset
fi

if [ "${1:-}" = "test" ]; then
  say "Resetting database (test suites need a fresh DB)…"
  supabase db reset
  for t in rls_test dashboard_test storage_test; do
    say "Running ${t}…"
    docker exec -i supabase_db_doorman psql -U postgres -d postgres \
      -v ON_ERROR_STOP=1 <"supabase/tests/$t.sql" >/dev/null
    say "$t passed"
  done
  say "All SQL suites green"
  exit 0
fi

# --- Functions env file -------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  say "Creating $ENV_FILE with local defaults"
  cat >"$ENV_FILE" <<'EOF'
AUTOMATION_SECRET=testsecret123
APP_ORIGIN=http://localhost:5173
# STRIPE_TEST_SECRET_KEY=sk_test_...      # add to test payments locally
# STRIPE_TEST_WEBHOOK_SECRET=whsec_...
EOF
fi

# --- Demo user (idempotent) ---------------------------------------------------
SERVICE_ROLE_KEY=$(supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
if [ -n "$SERVICE_ROLE_KEY" ]; then
  RESP=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Demo Host\"}}")
  case "$RESP" in
    *'"id"'*)             say "Demo user created: $DEMO_EMAIL / $DEMO_PASSWORD" ;;
    *already*|*exists*)   say "Demo user ready: $DEMO_EMAIL / $DEMO_PASSWORD" ;;
    *)                    say "Demo user check returned: $RESP" ;;
  esac
fi

# --- Edge functions + vite ----------------------------------------------------
stop_children() {
  # vite: whatever holds the port (npm's child, not npm itself)
  lsof -tnP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  # edge functions: any serve process, including strays from earlier runs
  pkill -f "supabase functions serve" 2>/dev/null || true
}
cleanup() {
  trap - EXIT INT TERM
  say "Shutting down…"
  stop_children
  # supabase (Docker) is left running; stop it with: supabase stop
}
trap cleanup EXIT INT TERM

# Clear anything stale from a previous run before starting fresh
stop_children
sleep 1

say "Starting edge functions…"
supabase functions serve --env-file "$ENV_FILE" &
sleep 2

say "Starting vite — app at http://localhost:5173 (Studio: http://127.0.0.1:54323)"
npm run dev &

wait
