# Load tests

Scripts that rehearse a big event night against a DoorMan stack: guests
opening their QR pass, door staff scanning, a ticket-sales burst (with Stripe
test mode and simulated webhook deliveries), and realtime chat fan-out. They
run as real user sessions, so RLS, column grants, and the edge functions are
all on the path.

Tools: Node 22 (repo `node_modules` for supabase-js) and [k6](https://k6.io)
(`brew install k6`).

## Point at a stack

```bash
source loadtest/local-env.sh            # local supabase start
# or, for a hosted project:
export LT_SUPABASE_URL=https://<ref>.supabase.co
export LT_ANON_KEY=...  LT_SERVICE_KEY=...  LT_WEBHOOK_SECRET=whsec_...
export LT_STRIPE_ACCOUNT=acct_...       # a charges-enabled connected account (test mode)
export LT_RUN=lt                        # prefix for every fixture email
```

Every fixture email is `<LT_RUN>-<kind>-<n>@loadtest.doorman.dev`, and the event
title starts with `LOADTEST <LT_RUN>`, so `cleanup.mjs` can find them again.
Turn off outbound email in the functions env (blank `RESEND_API_KEY`) before
running the checkout scenario, or every simulated sale sends a real email.

## Run

```bash
cd loadtest
node setup.mjs --guests 250 --staff 25 --buyers 60     # fixtures + sign-ins -> out/state.json
k6 run -e DURATION=30s k6/bystander.js                 # baseline latency for unrelated pages
k6 run -e ARRIVALS=250 -e WINDOW=60 k6/guestpass.js    # guests opening /pass at the door
k6 run -e SCANNERS=3 -e RACE=40 k6/checkin.js          # door scanning + same-ticket race
node reset-checkins.mjs                                # back to "approved" for another scanner count
k6 run -e BUYERS=60 -e WINDOW=10 -e TIER=general k6/checkout.js   # sales burst + duplicate webhooks
k6 run -e BUYERS=60 -e WINDOW=10 -e TIER=scarce  k6/checkout.js   # 60 buyers, 20 seats
node realtime.mjs --clients 250 --messages 30          # chat fan-out to 250 subscribers
node verify.mjs                                        # DB integrity: exactly-once, no oversell
node cleanup.mjs                                       # delete the event, orders and fixture users
```

Run `k6/bystander.js` in a second terminal during any scenario to see whether
that scenario slows the site down for everyone else. Access tokens expire after
an hour; `node setup.mjs --tokens-only` refreshes them without recreating data.

`k6 --summary-export out/<name>.json` keeps the numbers for a report.
