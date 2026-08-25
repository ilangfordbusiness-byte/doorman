# DoorMan

Events app — guestlists, tickets, promoters, and the door. React/Vite frontend
on Vercel, Supabase backend (Postgres + RLS, edge functions, Storage, Realtime,
pg_cron).

## Quick start

```bash
npm install
./dev.sh          # Supabase stack + edge functions + app on http://localhost:5173
```

`./dev.sh reset` wipes and re-applies all migrations first; `./dev.sh test` runs
the SQL test suites. Sign in locally with the dev form: `demo@doorman.dev` /
`demopass123` (created automatically).

