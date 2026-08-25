# DoorMan — Supabase + Vercel deployment runbook

The app is a Vite/React SPA (Vercel) on a Supabase backend: Postgres with RLS,
SQL RPCs for the dashboard reads, edge functions for money/QR/email flows,
Storage for images, Realtime for chat and live sales, pg_cron for schedules.

## Local development

```bash
npm install
supabase start                 # local stack (needs Docker)
supabase db reset              # apply all migrations
supabase functions serve --env-file supabase/functions/.env.local &
npm run dev                    # app on http://localhost:5173
```

`supabase/functions/.env.local` (not committed):

```
AUTOMATION_SECRET=testsecret123
APP_ORIGIN=http://localhost:5173
STRIPE_TEST_SECRET_KEY=sk_test_...        # optional until testing payments
STRIPE_TEST_WEBHOOK_SECRET=whsec_...      # optional
```

Create a local test user (service-role key is printed by `supabase start`):

```bash
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@doorman.dev","password":"demopass123","email_confirm":true,"user_metadata":{"full_name":"Demo Host"}}'
```

Sign in with the dev password form on the login screen (dev builds only).

### Tests

```bash
supabase db reset
for t in rls_test dashboard_test storage_test; do
  docker exec -i supabase_db_doorman psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 < supabase/tests/$t.sql
done
```

## Production deploy (one-time setup)

### 1. Supabase project

1. Create an organization + project at supabase.com (region close to users, e.g. London).
2. `supabase link --project-ref <ref>` (then `supabase db push`, `supabase functions deploy`).
3. Set function secrets:

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="DoorMan <tickets@yourdomain>" \
  APP_ORIGIN=https://yourdomain \
  AUTOMATION_SECRET=<long random string>
```

(`STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_WEBHOOK_SECRET` may be set alongside
for test-mode validation; checkout prefers the test key when present — remove
it to go live.)

4. Vault secrets for cron/webhook automation (SQL editor, once):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url');
select vault.create_secret('<same AUTOMATION_SECRET value>', 'automation_secret');
```

### 2. Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID**
   (Web application).
2. Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase dashboard → Authentication → Providers → Google: paste client ID +
   secret, enable.
4. Authentication → URL Configuration: set Site URL to the production domain,
   add `http://localhost:5173` to additional redirect URLs for local testing.

### 3. Resend (email)

1. Create a Resend account, add + verify the sending domain (DNS records).
2. Create an API key → `RESEND_API_KEY` secret above.
3. Recommended: Supabase Authentication → SMTP → point auth emails at Resend
   too (avoids the built-in 2-emails/hour cap).
4. Free tier caps at 100 emails/day — upgrade ($20/mo) before a launch that
   sells tickets.

### 4. Stripe

1. Platform account = the money owner's Stripe account; sign up for **Connect**
   once at dashboard.stripe.com/connect and complete the platform profile.
2. Developers → Webhooks → add endpoint
   `https://<ref>.supabase.co/functions/v1/ticketWebhook`, event
   `checkout.session.completed`; copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. API keys → `STRIPE_SECRET_KEY`.

### 5. Vercel

1. Import the repo (framework: Vite; build `npm run build`, output `dist` —
   `vercel.json` already handles SPA rewrites).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (see `.env.example`).
3. Attach the custom domain; make sure it matches `APP_ORIGIN` and the Google
   OAuth + Supabase URL configuration.

### 6. Launch checklist

- [ ] Upgrade Supabase to Pro when ticket sales go live (daily backups; no
      free-tier auto-pause).
- [ ] Full dress rehearsal in Stripe test mode: create event → buy ticket →
      receive email → transfer → scan QR at the door.
- [ ] Remove `STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_WEBHOOK_SECRET` secrets to
      flip checkout to live mode.
- [ ] Confirm cron jobs are listed: `select jobname, schedule from cron.job;`

## Environment variable reference

| Where | Name | Purpose |
| --- | --- | --- |
| Vercel | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | frontend → Supabase |
| Functions | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | live payments + webhook verify |
| Functions | `STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_WEBHOOK_SECRET` | test-mode validation (optional) |
| Functions | `RESEND_API_KEY` / `EMAIL_FROM` | outbound email |
| Functions | `APP_ORIGIN` | links in emails + redirect allow-list |
| Functions | `AUTOMATION_SECRET` | auth for cron/webhook-invoked functions |
| Vault | `functions_base_url` / `automation_secret` | Postgres → functions bridge |

## Legacy

`base44/` holds the original Base44 entity definitions and function sources the
migration was ported from; it is no longer used at runtime.
