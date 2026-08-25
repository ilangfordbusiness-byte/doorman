# DoorMan — Codebase Standards

How this codebase is organized, and the rules for deciding where new code goes.
Written during the Base44 → Supabase migration (Aug 2026); revisit as the app grows.

## Architecture in one picture

```text
Browser (React/Vite, Vercel)
   │  all data access through src/api/base44Client.js — the single choke point
   ▼
Supabase
   ├─ Postgres ······· tables, RLS policies, constraints, SQL functions (RPCs)
   ├─ Edge functions ·· TypeScript: money, email, QR check-in, webhooks
   ├─ Auth ············ Google sign-in (+ dev-only password form locally)
   ├─ Storage ········· avatars, event covers
   └─ Realtime ········ chat, live sales
```

There is deliberately **no app server**. The database and edge functions are the
backend. If that changes, see [When to consider a real server](#when-to-consider-a-real-server).

## Where new code goes — the decision rule

Work down this list; stop at the first match.

1. **No logic needed** (most features): new table + RLS policies + client CRUD
   through the compat layer. No functions anywhere. This should be the common case.

2. **Logic needed → edge function, in TypeScript.** This is the **default home
   for business logic**: anything with branching, multi-step workflows, secrets,
   or external APIs (Stripe, Resend, push, etc.). If it feels too complicated to
   express comfortably in SQL, it does not belong in SQL — write an edge function.

3. **SQL function (RPC) only for one of three specific reasons:**
   - **Hot aggregation reads** — dashboard-class payloads joining many tables,
     where one round trip beats an edge function's cold start + N internal queries.
   - **Atomicity under concurrency** — counter updates and check-then-write
     operations that must not race (e.g. `record_tier_sale`).
   - **Tiny privileged lookups** — a few lines that must bypass RLS with
     validation, where a whole edge function is overkill (e.g. `get_event_by_invite`).

   If a SQL function starts growing branches and stages, that's the signal it
   should have been an edge function — move it.

4. **Integrity always lives in the database, regardless of the above.**
   Constraints (`sold <= quantity`), unique indexes (`stripe_session_id` replay
   protection), and column defaults are not "business logic in SQL" — they are
   the last line of defense against bugs in *any* tier, and they stay even if
   everything else moves to a server someday.

## When to consider a real server

Edge functions cover today's needs. Start the "do we need a Go/TS server"
conversation when any of these become true:

- Long-running or scheduled work beyond what pg_cron + edge functions handle well.
- Heavy third-party integration surface (several external systems, queues, retries).
- A team is maintaining complex domain logic and wants one language + one test story.

The migration path is already built in: every page calls data through
`src/api/base44Client.js`. Stand up the server, repoint methods there one at a
time, and no page changes. Do not let business logic leak into pages in the
meantime — that is the one place it must never live, because users can tamper
with it.

## Security rules (non-negotiable)

- **Never trust the client.** Anything a user must not do is enforced by RLS,
  column grants, or a validating function — never only by UI state.
- **Secret columns stay unreadable**: `qr_secret`, `invite_code`, `staff_code`,
  `host_notes`, `stripe_account_id`, promoter counters (write). Access goes
  through validating RPCs (`get_event_private`, `my_qr_payload`, …).
- Because of column grants, **`select('*')` fails on protected tables** — use
  explicit column lists (the compat layer's entity definitions already do).
- Edge functions that are invoked by machines (webhooks, cron) authenticate via
  Stripe signature or `AUTOMATION_SECRET` header, never a user JWT
  (`verify_jwt = false` in `supabase/config.toml`).
- New tables in a migration get **no privileges by default** — grants must be
  explicit (see the baseline grants section of the RLS migration), including
  `service_role`.

## Data conventions

- **Money is integer minor units** (`*_minor`, pence): £20.50 = `2050`.
  Convert to display units only at the edges (compat layer / email templates).
- **People who may not have accounts yet** are referenced by `citext` email
  columns next to nullable `*_user_id` uuids; the `on_auth_user_created` trigger
  back-links them at signup.
- Old Base44 field names live **only** in `src/api/base44Client.js` mappers —
  the database schema uses the new names, pages use the old ones. New features
  should use one name end-to-end and skip the mapping.

## Testing

- `./dev.sh test` — resets the DB and runs the three SQL suites
  (`supabase/tests/`): RLS/security, dashboards, storage. Keep them green;
  extend them when adding policies or RPCs.
- Edge functions are verified against the local stack (`supabase functions serve`)
  with curl/scripted calls — the signed-webhook simulation in the PR history is
  the reference pattern.
- UI changes get a real browser pass before merging; the API layer passing does
  not prove buttons are wired to it.

## Local development

`./dev.sh` runs the whole stack (see `README.md`). Test accounts
`demo|buyer|carol|dave@doorman.dev` / `demopass123` are created on start.
Production setup lives in the local-only `DEPLOYMENT.md` (gitignored).
