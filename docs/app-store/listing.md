# App Store listing — DoorMan

Everything to paste into App Store Connect. Written 2026-10-02 for the 1.0
submission; update alongside the app. Field limits are App Store Connect's.

## App information

| Field | Value |
| --- | --- |
| Name (30) | `DoorMan` |
| Subtitle (30) | `Guestlists, tickets & the door` |
| Bundle ID | `com.thedoorman.app` |
| SKU | `doorman-ios` |
| Primary language | English (U.K.) |
| Primary category | Lifestyle |
| Secondary category | Entertainment |
| Content rights | Does not contain, show, or access third-party content |
| Age rating | See below |
| Privacy policy URL | `https://thedoorman.app/privacy` |
| Support URL | `https://thedoorman.app/privacy` (its "Contact us" section gives `contact@thedoorman.app`) |
| Marketing URL (optional) | `https://thedoorman.app` |
| Copyright | `2026 DoorMan` (legal entity name once the business is set up) |
| Price | Free |
| Availability | United Kingdom first; add United States when US hosts are onboarded (payouts already support USD) |

## Promotional text (170, editable without a new build)

```
Run the door from your pocket: guestlists, QR passes, ticket sales and check-in in one app.
```

## Description (4000)

```
DoorMan is the events app for the people who actually run the night: hosts, promoters, door staff and the guests who want in.

FOR HOSTS
• Create events in a minute: personal or under your business account
• Build the guestlist, approve requests, invite co-hosts and door staff
• Sell tickets with Stripe: tiers, early-bird releases, promo codes, capacity limits
• Watch sales and check-ins live, with analytics after the event
• Message everyone on the guestlist and post updates that reach them instantly

FOR GUESTS
• Discover events and request a spot, or get invited by a friend
• Buy tickets in a couple of taps and keep them in the app
• Your QR guest pass lives on your phone, works offline and is ready at the door
• Transfer a ticket to a friend when plans change
• See who's going, chat in the event and get reminders before it starts

FOR PROMOTERS
• Your own referral link and code for every event
• Track the sales you bring in and the commission you earn

FOR DOOR STAFF
• Scan guest passes with the built-in scanner
• Instant approve, plus-one and capacity checks, with a buzz when it's valid
• Works alongside the host's live view so nobody gets stuck at the door

Ticket payments are processed by Stripe. Hosts pay a small platform fee per paid ticket and can choose whether to absorb it or pass it on. Free events are free to run.

Sign in with Apple, Google or email. Delete your account at any time from your profile.
```

## Keywords (100, comma-separated, no spaces after commas)

```
guestlist,tickets,event,party,door,check-in,QR,promoter,nightlife,host,RSVP,invite
```

## What's New (first version)

```
First release of DoorMan for iPhone.
```

## Screenshots

Required: one set for 6.9" iPhone (1320 × 2868). App Store Connect scales it
for smaller phones. Files are in `docs/app-store/screenshots/` and were
captured from the iPhone 17 Pro Max simulator against seeded demo data; retake
them after any visual change.

| Order | File | Caption idea (optional text added in a design tool) |
| --- | --- | --- |
| 1 | `01-home.png` | Your next night, front and centre |
| 2 | `02-event.png` | Everything about the night in one place |
| 3 | `03-pass.png` | Your QR pass, ready at the door |
| 4 | `04-host-hub.png` | Run every event from your pocket |
| 5 | `05-guestlist.png` | Approve, check in, keep count |
| 6 | `06-analytics.png` | Sales and payouts, live |
| 7 (take on a device) | `07-scanner.png` | Scan passes in a second. The simulator camera shows a test pattern, so screenshot the Scanner screen on an iPhone pointed at a pass, and resize to 1320 × 2868 if the phone is not a 6.9" model. |

The demo data behind the screenshots is seeded locally (not committed): host
"Jordan Ellis", events Rooftop Sessions / Warehouse Nights / Supper Club /
Sunset Boat Party and friends with initials avatars. If the screenshots need
retaking, ask Claude for the seed or recreate similar data by hand; what
matters is that no real customer data appears.

App Preview video: optional, skip for 1.0.

## Age rating questionnaire

Answer **None** to everything except:

| Question | Answer | Why |
| --- | --- | --- |
| Alcohol, Tobacco, or Drug Use or References | Infrequent/Mild | Hosts describe nightlife events; the app itself has no such content |
| Unrestricted Web Access | No | The in-app browser only opens Stripe and sign-in pages |
| Gambling / Contests | No | |
| User-generated content | Declared via the UGC questions: yes, with moderation (hosts remove guests, admins ban users, account deletion exists) | Event chat and event descriptions |

Expected result: 12+ (from the alcohol reference). If it comes out 17+ you
answered "Frequent/Intense" somewhere; 12+ is right for this content.

## App Privacy (nutrition label)

Answer **Yes, we collect data from this app**. Everything below is **linked to
the user's identity** and **not used for tracking**. Keep this identical to
`ios/App/App/PrivacyInfo.xcprivacy`.

| Data type | Collected | Purpose | Linked | Tracking |
| --- | --- | --- | --- | --- |
| Contact Info → Name | Yes | App Functionality | Yes | No |
| Contact Info → Email Address | Yes | App Functionality | Yes | No |
| Contact Info → Phone Number | Yes | App Functionality | Yes | No |
| User Content → Photos or Videos | Yes (profile photo, event covers) | App Functionality | Yes | No |
| User Content → Other User Content | Yes (event chat, guestlist notes) | App Functionality | Yes | No |
| Location → Precise Location | Yes (auto check-out when leaving the venue, only while checked in) | App Functionality | Yes | No |
| Purchases → Purchase History | Yes (ticket orders) | App Functionality, Analytics | Yes | No |
| Identifiers → User ID | Yes | App Functionality | Yes | No |
| Identifiers → Device ID | Yes (push token) | App Functionality | Yes | No |
| Usage Data, Diagnostics | No | Vercel Analytics and the Meta pixel do not load in the app | | |
| Financial Info → Payment Info | No | Card details are entered on Stripe's hosted page, never seen by the app | | |

**Decision needed before answering "tracking: No":** when a business has set
up Meta ads tracking, `ticketWebhook` sends a server-side Purchase event to
Meta with the buyer's hashed email, name and phone plus client IP and
user agent, for every paid order, including orders placed from the iOS app
(`supabase/functions/_shared/meta.ts`, `createTicketCheckout` writes
`ticket_order_tracking`). Under Apple's definition that is "tracking"
(linking user data with a third party for advertising measurement; hashing
does not exempt it), which would require the App Tracking Transparency prompt
and a "Yes" here. Two ways to keep the answer "No":

1. **Recommended:** skip the Meta Purchase event and the tracking row for
   orders that originate from the iOS app. `createTicketCheckout` can tell:
   the native client sends `success_url` on `/native/return`. Store a
   `source = 'ios'` flag on the order or tracking row and have `meta.ts` skip
   it. Small PR, no UI change.
2. Keep sending it, add `@capacitor-community/app-tracking-transparency`,
   prompt once before the first checkout, and declare tracking here and in
   the privacy manifest. More work and a worse opt-in rate.

Until one of these ships, the honest answer is "Yes, tracking" for Purchase
History and Contact Info.

## App Review information

| Field | Value |
| --- | --- |
| Sign-in required | Yes |
| Demo account | A dedicated production account created for review, e.g. `appreview@thedoorman.app`, with a password stored in the password manager. Must not be a real customer. |
| Contact | First name, last name, phone, email of whoever will answer review questions within a day |

Notes for the reviewer (paste into the Notes field):

```
DoorMan is a guestlist and ticketing app for real-world events.

Sign in with the demo account above (email + password form at the bottom of the sign-in screen). The account is a host with a published demo event, "DoorMan Review Night", that has free and paid tickets on sale, a guestlist and door-staff access.

To test the guest flow: open the event from the Home tab, tap "Get tickets", choose the free tier and complete checkout. The pass appears under the Guest tab with a QR code.
To test paid tickets: Stripe is in live mode; please use the free tier. A paid tier is shown so the pricing UI can be reviewed without charging a card.
To test the door: Host tab → the event → Guestlist, or open the Scanner and point it at the QR shown under Guest → your pass.

Tickets are for physical events, so payment goes through Stripe Checkout (guideline 3.1.3(e)); the app sells no digital content.
Sign in with Apple and Google are both offered. Account deletion is under Profile → Delete account.
Push notifications are used for event updates, chat messages and reminders.
Location is requested only while a guest is checked in at a venue, to check them out automatically when they leave.
```

Before submitting: create the review account on production, make it a host,
create "DoorMan Review Night" dated a few weeks out with a free tier (and a
paid tier that can stay unsold), and log in with it once on a phone to clear
the onboarding gate (name, phone, Instagram, photo) so the reviewer lands on
Home.

## Version release

- **Manually release this version** for 1.0, so the release can be timed and
  the production backend checked once more after approval.
- Phased release: off for 1.0 (nobody has it yet); on from 1.1.
- Reset iOS summary rating on new version: no.
