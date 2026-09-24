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
`demopass123` (created automatically). Sign-up confirmation and password-reset
emails land in Mailpit at http://127.0.0.1:54324 (no real email is sent locally).

## iOS app

The iOS app is the same web bundle wrapped in Capacitor (`capacitor.config.ts`,
`ios/`). Requires Xcode 16+; Swift Package Manager resolves the plugins, no
CocoaPods needed. Everything native goes through `src/lib/native.js`.

```bash
npm run ios:sync   # vite build + copy the bundle into ios/ and update plugins
npm run ios:open   # open ios/App/App.xcodeproj in Xcode, then run on a simulator
npm run ios:dev    # live reload from the Vite dev server on a simulator/device
```

Testing on a physical device against the local stack: the phone cannot reach
`127.0.0.1`, so put your Mac's LAN address in `.env.local`
(`VITE_SUPABASE_URL=http://<mac-ip>:54321` plus the local anon key) before
`npm run ios:sync`. Google sign-in returns to the app through the
`doorman://auth/callback` URL scheme, Sign in with Apple is native, and links
to `thedoorman.app` open in the app once the site serves
`public/.well-known/apple-app-site-association` (replace `TEAMID` with the
Apple team id). Release builds: bump `MARKETING_VERSION` in Xcode, `npm run
ios:sync`, Product → Archive.

