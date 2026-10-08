# iOS release runbook

How DoorMan gets from `main` to the App Store, and what to check right before
each release. Written 2026-10-02 for 1.0. Store copy, privacy answers and
review notes live in [`app-store/listing.md`](app-store/listing.md).

Legend: ☐ to do · ✅ already done in the repo · 👤 needs the Apple/Supabase
account owner · ⏱ typical time.

## 0. Already in place

- ✅ Capacitor shell, native auth, deep links, Stripe sheet, push, native chrome (PRs #107–#110, #124, #133, #134).
- ✅ Production database has every migration through `20260928130000`, including `push_devices` and OAuth sign-up.
- ✅ `https://thedoorman.app/.well-known/apple-app-site-association` is served as JSON (team id placeholder still inside, see B2).
- ✅ Privacy manifest `ios/App/App/PrivacyInfo.xcprivacy` (UserDefaults reason, collected data types, no tracking).
- ✅ `Info.plist`: URL scheme, camera/location/photo usage strings, encryption exemption, portrait only. Icon has no alpha channel.
- ✅ `npm run ios:archive` (`scripts/ios-archive.sh`) builds, archives and uploads to App Store Connect with an auto-incrementing build number.
- ✅ Store listing copy, keywords, age-rating and privacy answers, reviewer notes: `docs/app-store/listing.md`.
- ✅ Six 6.9" screenshots (1320 × 2868) in `docs/app-store/screenshots/`; the scanner shot still needs a real phone (simulator camera is a test pattern).

## A. Apple Developer portal 👤 ⏱ 30 min

1. ☐ Note the **Team ID** (Membership details). You will paste it in three places below.
2. ☐ Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App → explicit `com.thedoorman.app`, description "DoorMan". Capabilities: **Associated Domains**, **Push Notifications**, **Sign in with Apple** (Enable as a primary App ID). Register.
3. ☐ Keys → **+** → name "DoorMan APNs", tick **Apple Push Notifications service (APNs)** → Register → **Download** the `.p8` (only possible once) → note the **Key ID**. Put the file in the password manager, never in the repo.
4. ☐ Optional but worth it for the archive script: Users and Access → Integrations → App Store Connect API → Team Keys → generate a key with **App Manager** role; note Issuer ID, Key ID, download `.p8`. Lets `ios:archive` upload without an interactive Xcode login.

## B. Wire the team id and secrets ⏱ 1 h

1. ☐ **Supabase dashboard** (project `egxopdlzcxapfpjwfyki`) → Authentication → URL Configuration → Redirect URLs: add `doorman://auth/callback`.
2. ☐ Authentication → Providers → **Apple**: enable, Client IDs `com.thedoorman.app`. Leave Secret Key empty (native-only; it is for web Sign in with Apple).
3. ☐ Edge function secrets (`supabase secrets set` or dashboard → Edge Functions → Secrets):
   ```
   APNS_TEAM_ID=<Team ID>
   APNS_KEY_ID=<Key ID from A3>
   APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   APNS_ENV=production
   APNS_BUNDLE_ID=com.thedoorman.app
   ```
   Then redeploy the functions that push so they pick the secrets up:
   `supabase functions deploy notifyEventUpdate notifyChatMessage sendEventReminders initiateTicketTransfer deleteAccount`.
4. ☐ **Repo**: replace `TEAMID` in `public/.well-known/apple-app-site-association` with the Team ID (two places), open a PR, merge, let Vercel deploy. Check with
   `curl -s https://thedoorman.app/.well-known/apple-app-site-association | head -5`.
   Apple's CDN caches this for hours; do it before the first device test. Verify Apple can read it at
   `https://app-site-association.cdn-apple.com/a/v1/thedoorman.app`.
5. ☐ **Meta tracking decision** (see "App Privacy" in `listing.md`): either ship the small PR that skips the Meta Purchase event for iOS-originated orders, or declare tracking + add the ATT prompt. Decide before filling in App Privacy.
6. ☐ **Review account**: on production, sign up `appreview@thedoorman.app` (or similar) by email, complete onboarding, make it a host, create "DoorMan Review Night" a few weeks out with a free tier and a paid tier. Password into the password manager.

## C. Xcode signing and first device build ⏱ 30 min

1. ☐ Xcode → Settings → Accounts → add the Apple ID that belongs to the team.
2. ☐ `npm run ios:open` → target **App** → Signing & Capabilities → Team = the organisation, Automatically manage signing. Xcode registers the device and creates the profile. Capabilities already listed: Associated Domains, Push Notifications, Sign in with Apple. Fix anything red.
3. ☐ Commit the `DEVELOPMENT_TEAM` change Xcode writes into `project.pbxproj` (it is the one signing value that belongs in git).
4. ☐ Plug in an iPhone, select it, **Run**. The debug build talks to production (no `.env.local` override). Sign in, confirm the app opens.
5. ☐ **APNs spike** (on the first TestFlight build from section E, not this Xcode build: Xcode debug builds register with Apple's *sandbox* push environment while the backend is set to `production`): sign in on the phone, edit from the web an event the phone's account is a guest at; a push should arrive within seconds. If not, check the function logs in the Supabase dashboard for `push:`. A `BadDeviceToken` for every device means the environment mismatch; a connection error means the edge runtime cannot reach `api.push.apple.com` over HTTP/2, in which case a small relay is the fallback (see the header of `supabase/functions/_shared/push.ts` for the env knobs).

## D. App Store Connect record ⏱ 2–3 h

1. ☐ App Store Connect → My Apps → **+** → New App: iOS, name `DoorMan`, primary language English (U.K.), bundle ID `com.thedoorman.app`, SKU `doorman-ios`, full access.
2. ☐ App Information: categories, content rights, age rating questionnaire (answers in `listing.md`).
3. ☐ App Privacy: answers in `listing.md` (after the B5 decision). Publish the answers.
4. ☐ Pricing and Availability: Free; territories UK (add US later).
5. ☐ Version 1.0 → iOS App: upload the screenshots from `docs/app-store/screenshots/` to the 6.9" slot (add the scanner shot from a phone if you have one); promotional text, description, keywords, support URL, marketing URL, copyright, version `1.0`.
6. ☐ App Review Information: sign-in required, review account from B6, contact details, the reviewer notes from `listing.md`.
7. ☐ Version Release: **Manually release this version**.
8. ☐ TestFlight tab → Test Information: beta description, feedback email, privacy policy URL (needed before external testers; internal testers work without it).

## E. First build to TestFlight ⏱ 20 min + 10 min processing

```bash
APPLE_TEAM_ID=XXXXXXXXXX npm run ios:archive
# or non-interactive:
APPLE_TEAM_ID=XXXXXXXXXX ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=~/Keys/AuthKey_....p8 npm run ios:archive
```

- The script refuses to run while the AASA still says `TEAMID`.
- Build number = UTC timestamp, so every upload is newer than the last. Marketing version stays `1.0` until you bump `MARKETING_VERSION` in Xcode.
- ☐ Wait for "Ready to Test" in TestFlight (email). First build of a new app asks the export-compliance question once in the web UI: answer **No** (the plist already says so) and tick "Make available".
- ☐ TestFlight → Internal Testing → create group "DoorMan team", add yourself and 2–3 people who run doors. They get an email, install TestFlight, install DoorMan.

## F. Test phase — right before publishing ⏱ half a day, on a real iPhone with the TestFlight build

Do this on the exact build you will submit, against production. Keep a note of
anything that fails; re-upload only if something is broken (a new build means
re-doing this list, so batch the fixes).

**Sign-in and account**
- ☐ Fresh install, cold start: black splash, then the sign-in screen with Apple, Google and email. Nothing drawn under the status bar.
- ☐ Sign in with Apple, first time: Apple sheet, Face ID, lands in the app; onboarding gate shows the Apple-provided name pre-filled, asks for phone/Instagram/photo.
- ☐ Settings → Apple ID → Sign-In & Security → Sign in with Apple → DoorMan → **Stop using**. Sign in with Apple again: works, gate asks for the name (Apple no longer sends it).
- ☐ Sign in with Google: Safari sheet opens, pick the account, sheet closes by itself, signed in. A **new** Google address gets an account and the onboarding gate.
- ☐ Email sign-in with the review account. Sign out from Profile returns to the sign-in screen. Force-quit and relaunch keeps a signed-in session.
- ☐ Forgot password: request from the app, open the email on the phone, the link opens **the app** (universal link) at the new-password form; set a password; sign in with it.
- ☐ Account deletion: with a throwaway account, Profile → Delete account → confirm → back on the sign-in screen; signing in again fails.

**Links into the app**
- ☐ Paste `https://thedoorman.app/event/<id>` into Notes and tap it: opens in DoorMan, not Safari, on the event page.
- ☐ Same with an invite link (`/invite/<code>`) and a promoter link (`/event/<id>?ref=<code>`); after buying with the ref link the sale is attributed to the promoter.
- ☐ Long-press a `thedoorman.app` link → "Open in DoorMan" is offered.
- ☐ Kill the app, tap a link: cold-starts straight onto the right page.

**Push**
- ☐ Permission prompt appears only after signing in, once. Accept.
- ☐ Edit an event you are a guest at (from the web, as the host) → banner "Update: <event>" arrives; tapping it opens that event in the app.
- ☐ Host posts in the event chat → banner with the message; tapping opens the event.
- ☐ Sign out → `push_devices` row for the phone is gone (check in the dashboard: Table Editor → push_devices). Sign in → row is back with the app version.
- ☐ Decline permission on a second phone or after reset: the app keeps working, no repeated prompts.

**Guest flow**
- ☐ Home shows public events with covers; search and filters work; pull to refresh.
- ☐ Request a spot on a private event → host approves on the web → guest sees the pass and gets the push.
- ☐ **Buy a ticket**: Get tickets → quantity, promo code field → **Pay** → Stripe sheet (Apple Pay available, card entry works) → "Return to DoorMan" → success screen shows the right order → pass under Guest. Use a real card on the cheapest tier, then refund from the Stripe dashboard (the app itself has no refunds).
- ☐ Press **Done** in the Stripe sheet without paying → back in the app, seats released, no order left pending (checkout screen allows retry).
- ☐ Pay, then press Done *before* Stripe redirects → the app still finds the paid order within ~15 s and shows success (no false "cancelled").
- ☐ Guest pass: QR renders instantly; turn on Airplane mode: still renders. Brightness goes up on the pass screen if that is implemented; the pass is readable by the scanner.
- ☐ Transfer a ticket to a friend by email → they get the email and the push; accepting moves the ticket.
- ☐ Event chat: send a message; it shows live on the web; keyboard pushes the composer up without a gap; status bar stays readable.
- ☐ Who's going renders avatars; tapping a profile works.

**Host flow**
- ☐ Create an event with a cover from the photo library (permission prompt, picker works) and with the camera (prompt, capture works).
- ☐ Edit the event; guests on the test phones get the push.
- ☐ Guestlist: approve, add a manual guest, toggle plus-one, check a guest in by hand; counts update.
- ☐ Analytics loads; sales appear after the test purchase.
- ☐ Stripe Connect: Profile → Payouts → Set up → onboarding in the sheet → "Return to DoorMan" → status refreshes to connected. Also tap the Stripe dashboard link: it opens and comes back.
- ☐ Sell sheet: QR renders; **Share** opens the iOS share sheet with the link; Download/Print are hidden in the app.
- ☐ Promoters: create a code, open the promoter dashboard link on the phone.

**Door flow**
- ☐ Scanner: camera prompt once; live preview; scan a pass from another phone → green result + haptic; scan it again → "already checked in" + error haptic; scan a pass for a different event → rejected.
- ☐ Lock the phone and unlock on the scanner: camera resumes. Background the app and come back: camera resumes.
- ☐ Staff: sign in as door staff with the staff code; only the scanner and the right event are available.
- ☐ Auto check-out: with location granted and a guest checked in, moving away from the venue checks them out (or confirm the location prompt wording and that denying it does not break the pass).

**Chrome and polish**
- ☐ No white flash at launch; dark status bar text on every screen; nothing hidden behind the Dynamic Island or the home indicator on Home, Event, Pass, Scanner, Business hub, Login.
- ☐ Rotate the phone: stays portrait.
- ☐ Low-power mode and a slow connection: spinners, no blank screens.
- ☐ Delete the app, reinstall: signed out, no stale data.

**Backend check while testing**
- ☐ Supabase → Edge Functions → logs: no `capacitor://localhost` URLs anywhere, no `push:` errors apart from devices that were deliberately removed.
- ☐ Stripe dashboard: the test order's `success_url`/`cancel_url` point at `thedoorman.app/native/return`.
- ☐ Web app still works for the same flows (same code): sign-in, buy, pass, scanner in Safari. Universal links do **not** hijack normal web browsing on the Mac.

**Web regression (same bundle ships to Vercel)**
- ☐ `npm run lint && npm run typecheck && npm run build` green on `main`; CI green.
- ☐ Quick pass on https://thedoorman.app: Home, an event, sign-in, pass, scanner permission prompt.

## G. Submit ⏱ 15 min, then 1–3 days

1. ☐ App Store Connect → 1.0 → **Build** → pick the TestFlight build you just tested.
2. ☐ Re-read the reviewer notes; confirm the review account still signs in and the review event is still upcoming.
3. ☐ **Add for Review** → **Submit to App Review**.
4. ☐ Watch for "Waiting for Review" → "In Review" → "Pending Developer Release". Reply to any reviewer message within a day from Resolution Center. Typical first-submission rejections: demo account cannot complete the flow, privacy answers vs observed behaviour, missing purpose string. Fix metadata-only issues without a new build.

## H. Release ⏱ 10 min

1. ☐ Confirm production is healthy (Supabase status, Vercel deploy is the same commit as the build).
2. ☐ **Release This Version**. Propagation to the store takes up to 24 h; the listing URL appears under App Information.
3. ☐ Add the App Store badge/link to the website and the auth emails if wanted.
4. ☐ Save a note of: build number, commit SHA, date. Tag the commit `ios-v1.0`.

## I. Every update after 1.0

- Web-only changes still deploy to Vercel instantly. Backend changes (migrations, edge functions) deploy instantly and must stay compatible with the oldest binary in the wild.
- iOS changes: bump `MARKETING_VERSION` in Xcode when the user-visible version changes (1.0.1 for fixes, 1.1 for features), `npm run ios:archive`, TestFlight, the short version of section F (sign-in, one purchase, one scan, push, links), submit with "What's New", release with **phased release on**.
- Over-the-air web updates (Capgo) are the follow-up that lets frontend fixes skip the store; native changes still need a build.
- Rotate nothing: the APNs key does not expire. If it ever leaks, revoke it in the portal, create a new one, update the three `APNS_*` secrets.

## Known gaps to decide on before or just after 1.0

- Meta Conversions API counts as tracking for iOS orders (section B5).
- No crash reporting in the binary. Sentry's Capacitor SDK is a one-hour add if crashes need visibility.
- Stripe Connect dashboard links use `account_dashboard`, which fails for Custom accounts; production uses Express accounts, so verify once with a real host in section F.
- `aps-environment` is `development` in `App.entitlements`; Xcode swaps it to `production` for App Store and TestFlight builds automatically. Debug builds on a phone receive sandbox pushes, so with `APNS_ENV=production` the **Xcode-run** build will not get pushes; only TestFlight/App Store builds will. Test push in section F on the TestFlight build, not the Xcode build.
