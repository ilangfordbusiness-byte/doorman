# App Store listing — DoorMan

Everything to paste into App Store Connect. Written 2026-10-02 for the 1.0
submission; update alongside the app. Field limits are App Store Connect's.

## App information

| Field | Value |
| --- | --- |
| Name (30) | `DoorMan – Events & Tickets` (plain `DoorMan` is taken on the App Store; the home-screen name stays `DoorMan`) |
| Company name | `DoorMan.app Ltd` (seller line shows `DOORMAN.APP LTD`; cannot be changed) |
| App Store Connect app ID | `6821447175` |
| Subtitle (30) | `Guestlists, passes & the door` |
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
| Copyright | `2026 DoorMan.app Ltd` |
| Price | Free |
| Availability | United Kingdom and United States. iPhone only: Mac (Apple silicon) and Vision Pro availability are off |

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

Answer **Yes, we collect data from this app**. Keep these answers identical to
`ios/App/App/PrivacyInfo.xcprivacy`.

The app uses data for tracking. A business can connect its Meta Pixel and
Conversions API token to measure its own ads. On the events of that business,
the app loads the pixel. After a purchase, `ticketWebhook` sends a Purchase
event to Meta with the hashed email, name, phone and user ID of the buyer.
Apple calls this "tracking". Hashed data is not an exception.

The iOS app shows the App Tracking Transparency (ATT) prompt before it tracks.
The prompt comes when a user first opens an event of a business with a Meta
Pixel. If the user selects "Ask App Not to Track", the app does not load the
pixel. The order then gets `tracking_allowed = false` in
`ticket_order_tracking`, and the server sends no Purchase event to Meta.
Web orders do not change.

| Data type | Collected | Purpose | Linked | Tracking |
| --- | --- | --- | --- | --- |
| Contact Info → Name | Yes | App Functionality, Third-Party Advertising | Yes | Yes |
| Contact Info → Email Address | Yes | App Functionality, Third-Party Advertising | Yes | Yes |
| Contact Info → Phone Number | Yes | App Functionality, Third-Party Advertising | Yes | Yes |
| User Content → Photos or Videos | Yes (profile photo, event covers) | App Functionality | Yes | No |
| User Content → Other User Content | Yes (event chat, guestlist notes) | App Functionality | Yes | No |
| Location → Precise Location | Yes (auto check-out when the guest goes away from the venue, only while checked in) | App Functionality | Yes | No |
| Purchases → Purchase History | Yes (ticket orders) | App Functionality, Analytics, Third-Party Advertising | Yes | Yes |
| Identifiers → User ID | Yes | App Functionality, Third-Party Advertising | Yes | Yes |
| Identifiers → Device ID | Yes (push token) | App Functionality | Yes | No |
| Usage Data → Product Interaction | Yes (Meta Pixel ViewContent and InitiateCheckout on business events) | Third-Party Advertising | No | Yes |
| Diagnostics | No | Vercel Analytics does not load in the app | | |
| Financial Info → Payment Info | No | The buyer types card details on the hosted page of Stripe. The app does not see them. | | |

The text of the ATT prompt is `NSUserTrackingUsageDescription` in
`ios/App/App/Info.plist`. The privacy manifest declares `connect.facebook.net`
and `www.facebook.com` as tracking domains. iOS blocks connections to these
domains until the user allows tracking.

## App Review information

| Field | Value |
| --- | --- |
| Sign-in required | Yes |
| Demo account | `akshay.irudayaraj+appreview@gmail.com` (password in the password manager). Owns the business "DoorMan Review" (Meta Pixel ID `1234567890123456`, a dummy so the ATT prompt shows) and the private, free event "DoorMan Review Night", hidden from Discover. Invite link: https://thedoorman.app/invite/557269464e00 |
| Contact | First name, last name, phone, email of whoever will answer review questions within a day |

Notes for the reviewer (paste into the Notes field):

```
DoorMan is a guestlist and ticketing app for real-world events.

Sign in with the demo account above (tap "Sign in with email" on the sign-in screen). The account owns the business "DoorMan Review" and its private, free demo event "DoorMan Review Night". The event is hidden from Discover so real users do not see it.

To open the event as the host: if the app opens on the DoorMan Review "Events" page, tap the event there. Otherwise go to Profile → DoorMan Review → Switch → Events.
On the event page, the host can open Guestlist, Door (check-in list and QR scanner) and Share.

To test the guest flow you need a second account:
1. Sign out (Profile), then sign in with Sign in with Apple. This creates a new guest account.
2. Open the invite link: https://thedoorman.app/invite/557269464e00 and tap "Request to Join".
3. Sign out, sign in with the demo account again, open the event → Guestlist and approve the request.
4. Sign in as the guest again and open the invite link. Tap "Open QR Pass" to see the guest pass.
5. To test the door: as the demo account, open the event → Door → Scan, and scan the QR code on the guest pass.

Paid events take payment through Stripe Checkout for tickets to physical events (guideline 3.1.3(e)). The app sells no digital content. The demo event is free, so no card is needed.
Sign in with Apple and Google are both offered. Account deletion is under Profile → Delete account.
App Tracking Transparency: organisers with a business account can connect their own Meta ads pixel. The tracking permission prompt appears the first time you open an event of such an organiser ("DoorMan Review Night" is one). If you choose "Ask App Not to Track", no data is shared with Meta.
Push notifications are used for event updates, chat messages and reminders.
Location is requested only while a guest is checked in at a venue, to check them out automatically when they leave.
```

Before submitting: check that "DoorMan Review Night" is still upcoming (move
its date if review takes long), that the demo login works, and that the
invite link opens the event. Do not delete the account, business or event
until the app is approved.

## Version release

- **Manually release this version** for 1.0, so the release can be timed and
  the production backend checked once more after approval.
- Phased release: off for 1.0 (nobody has it yet); on from 1.1.
- Reset iOS summary rating on new version: no.
