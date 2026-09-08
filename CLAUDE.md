# CLAUDE.md — DoorMan

Orientation for AI agents working in this repository. Read this file first,
then the coding standards, before touching any code.

> **Required reading for every agent:** `docs/STANDARDS.md` is the source of
> truth for where code goes, security rules, data conventions, and testing
> expectations. It is imported below so it is always in context. Nothing in
> this file overrides it. If this file and the standards ever disagree, the
> standards win — fix this file.
>
> @docs/STANDARDS.md

## What DoorMan is

DoorMan is an events app for hosts, guests, promoters, and door staff:

- **Hosts** create events (personal or under a business account), manage
  guestlists, invite co-hosts, sell tickets, and see analytics.
- **Guests** discover events, request or accept invites, buy tickets, hold a
  QR guest pass, transfer tickets, chat in the event, and see who is going.
- **Promoters** get a referral code per event and earn commissions on sales.
- **Door staff** scan QR passes with the doorman scanner to check guests in.
- **Admins** (super-admin only) manage users and events and can impersonate.

Money flows through Stripe Connect. Ticket prices are stored in integer minor
units (pence). The platform fee is 45p + 4% per paid ticket, either absorbed by
the host or passed on to the buyer per event (`fee_mode`).

## Architecture in one line

React/Vite single-page app on Vercel, talking directly to Supabase (Postgres
with row-level security, edge functions in TypeScript/Deno, Auth, Storage,
Realtime, pg_cron). **There is no app server** by design. The database and edge
functions are the backend.

Every page reaches data through one file, `src/api/data.js`. That is the single
choke point and the planned migration seam if a real server is ever needed.

## Repository layout

```text
src/
  api/
    client.js        Supabase client (falls back to the local stack with no .env)
    data.js          THE data layer: entities CRUD, auth.me, functions.invoke,
                     uploads, admin. Maps legacy field names <-> DB columns.
  pages/             One React component per route (see routes below)
    business/        Business-account pages (create event, past events, edit)
  components/        Feature components (EventCard, GuestCard, EventChat, ...)
    ui/              shadcn/ui primitives (generated; do not hand-edit casually)
    business/, checkout/, home/   Feature-grouped components
  hooks/             React hooks (useCurrentUser, useNotifications, useStripeStatus, ...)
  lib/               AuthContext, fees, phone normalization, impersonation,
                     promoter ref capture, react-query client, cn() helper
  utils/index.ts     createPageUrl helper
  App.jsx            Router, auth gate, lazy-loaded routes
  main.jsx           Entry point

supabase/
  migrations/        Ordered SQL migrations: schema, RLS, RPCs, storage,
                     automation (pg_cron), and every feature change since.
                     Never edit an applied migration; add a new one.
  functions/         Edge functions, one directory each (Deno, TypeScript)
    _shared/         db.ts (service client, getCaller, json, preflight),
                     email.ts (Resend), tickets.ts (pricing, QR, ticket email),
                     connect.ts (payout-account resolution)
  tests/             SQL test suites: rls_test, dashboard_test, storage_test
  config.toml        Local stack config; verify_jwt=false list for machine-invoked functions

docs/STANDARDS.md    Coding standards (required reading)
README.md            Quick start
DEPLOYMENT.md        Production runbook (gitignored, local-only)
dev.sh               One-command local stack
```

### Routes (from `src/App.jsx`)

| Path | Page | Who |
| --- | --- | --- |
| `/` | Home | everyone |
| `/create-event`, `/event/:id/edit` | CreateEvent, EditEvent | host |
| `/event/:id` | EventDetails | guests, host |
| `/event/:id/guestlist` | GuestlistManagement | host, co-hosts |
| `/event/:id/checkout` | TicketCheckout | buyer |
| `/event/:id/analytics` | EventAnalytics | host |
| `/event/:id/promoters`, `/promoter/:code` | PromoterPanel, PromoterDashboard | host, promoter |
| `/host`, `/guest`, `/staff` | HostHub, GuestHub, StaffHub | role hubs |
| `/friends`, `/profile` | Friends, Profile | everyone |
| `/invite/:code` | InvitePage | invitee |
| `/pass/:id` | GuestPass (QR) | guest |
| `/scanner` | DoormanScanner | host, co-host, staff |
| `/business/*` | Business account pages | business owners |
| `/admin` | Admin | super-admin |
| `/privacy`, `/reset-password` | public pages | no session needed |

### Edge functions

Money and side effects live here: `createTicketCheckout`, `ticketWebhook`
(Stripe, exactly-once fulfilment), `refundTicket`, `stripeConnect`,
`payPromoterCommissions`, ticket transfers (`initiateTicketTransfer`,
`acceptTicketTransfer`), `validateQR` (door check-in), `sendTicketEmail`,
notifications (`notifyEventUpdate`, `notifyChatMessage`, `sendEventReminders`),
`autoCheckoutGuests` (cron), `acceptCoHost`, `validatePromoCode`,
`manageTicketCatalog`, `deleteAccount`, and admin (`adminUsers`, `adminEvents`).

Webhook and cron functions are `verify_jwt = false` and authenticate with the
Stripe signature or the `AUTOMATION_SECRET` header instead of a user JWT.

## Working in this codebase

### Commands

```bash
npm install
./dev.sh            # Supabase stack + edge functions + Vite on http://localhost:5173
./dev.sh reset      # wipe and re-apply all migrations first
./dev.sh test       # reset DB and run the three SQL suites
npm run lint        # eslint (src/pages, src/components, excluding ui/ and lib/)
npm run typecheck   # tsc over jsconfig.json (checkJs)
npm run build       # production build
```

Requires Docker and the Supabase CLI. Local sign-in uses the dev password form
with `demo@doorman.dev` / `demopass123` (created by `dev.sh`). Local emails land
in Mailpit at http://127.0.0.1:54324.

### Rules of thumb (details in the standards)

- **Pages never call Supabase directly.** Go through `api` from `src/api/data.js`.
  Do not import `supabase` from `client.js` outside `src/api` and `src/lib`.
- **Business logic goes in edge functions.** SQL functions only for hot
  aggregation reads, atomic counters, or tiny privileged lookups.
- **Integrity lives in the database.** Constraints, unique indexes, RLS.
  UI state is never the enforcement.
- **Protected tables reject `select('*')`** because of column grants. Use
  explicit column lists.
- **Schema changes are new migration files** with the next timestamp in
  `supabase/migrations/`. Extend the SQL tests when adding policies or RPCs.
- **Money is integer minor units** everywhere except display.
- **Phones are normalized** through `src/lib/phone.js` at the data-layer choke
  points. Matching elsewhere is exact string equality, so never bypass it.
- **New features use one field name end-to-end.** The legacy-name mapping in
  `data.js` exists for old pages only; do not grow it.

### Git workflow

- Branch from `main` with a `feat/`, `fix/`, `chore/`, `perf/`, or `docs/`
  prefix. Never push directly to `main`.
- Conventional-commit titles scoped by feature area, for example
  `feat(tickets): ...`, `fix(whos-going): ...`. Open a PR for every change.
- Migrations and the code that uses them ship in the same PR.
- UI changes get a real browser pass before merging. Passing the API layer does
  not prove buttons are wired to it.

### Testing expectations

- `./dev.sh test` must stay green.
- Edge functions are exercised against the local stack with curl or scripted
  calls. Webhooks are tested with a signed-payload simulation.
- Lint and typecheck clean before opening a PR.

## Related docs

- [`docs/STANDARDS.md`](docs/STANDARDS.md) — coding standards, required reading
- [`README.md`](README.md) — quick start
- `DEPLOYMENT.md` — production setup and env var reference (local-only, gitignored)
