// Public privacy policy — must be reachable without an account (Google's
// OAuth consent screen links here). Rendered outside the auth gate in App.jsx.

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 mb-8 text-sm text-muted-foreground hover:text-foreground">
          <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
          DoorMan
        </a>
        <h1 className="font-heading font-extrabold text-3xl mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 10 October 2026</p>

        <Section title="Who we are">
          <p>
            thedoorman.app is operated by Doorman LTD ("we", "us") — an events
            platform for guestlists, tickets and door check-in. Doorman LTD is
            the data controller for the personal information described below.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong className="text-foreground">Account details</strong> — your name, email
            address, phone number, profile photo, and (optionally) Instagram handle. If you
            sign in with Google, we receive your name, email and profile picture from Google.
          </p>
          <p>
            <strong className="text-foreground">Event activity</strong> — events you host,
            join or are invited to; guestlist status; ticket purchases and transfers; and
            check-in/check-out times at the door.
          </p>
          <p>
            <strong className="text-foreground">Payments</strong> — ticket payments are
            processed by Stripe. We never see or store your card number; we keep transaction
            records (amount, ticket type, payment status).
          </p>
          <p>
            <strong className="text-foreground">Messages</strong> — messages you post in an
            event's chat.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To run the service: managing guestlists, issuing and validating QR tickets,
            processing payments and payouts, sending tickets and event emails (confirmations,
            reminders, transfers), and showing hosts who is attending their events.
          </p>
          <p>
            We do not sell your personal information. Some event organisers use Meta ads to
            promote their events; see "Organiser ad measurement" below for what we share with
            Meta on their behalf.
          </p>
        </Section>

        <Section title="Who can see your information">
          <p>
            Event hosts, their co-hosts and door staff can see your name, contact details and
            attendance status for events you join. Other guests may see your name and photo on
            an event's attendee list where the host has enabled that. Friends you connect with
            can see your profile.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            We rely on a small number of processors to run DoorMan: Supabase (database,
            authentication and file storage), Stripe (payments), Resend (email delivery),
            Vercel (hosting) and Apple (push notifications in the iOS app). Each receives only
            what it needs to provide its service.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            We keep your data while your account is active. To delete your account and
            associated personal data, contact us — we will remove it except where we must
            keep records (for example, payment records required for tax and accounting).
          </p>
        </Section>

        <Section title="Organiser ad measurement">
          <p>
            An event organiser with a business account can connect their own Meta (Facebook and
            Instagram) ads account, so they can measure which of their ads lead to ticket sales.
            We do this only for that organiser's events. Other events are not affected.
          </p>
          <p>
            On the website, the event and checkout pages of those events load the Meta Pixel,
            which records page views and checkout steps and can set Meta cookies. When you buy
            a ticket to one of those events, we also send Meta the purchase (order id, value
            and currency) with your email address, name and phone number in hashed form, your
            IP address and browser details, so Meta can match the sale to an ad.
          </p>
          <p>
            In the DoorMan iOS app, none of this happens unless you allow tracking when the app
            asks. You can change this at any time in iOS Settings → Privacy &amp; Security →
            Tracking. Meta uses this data under its own privacy policy. To object to this use
            of your data on the website, contact us.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use browser storage to keep you signed in. On the event pages of organisers who
            use Meta ad measurement, Meta may set its own cookies, as described above. We do not
            use any other advertising cookies.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you live (including under UK/EU GDPR), you may have rights to
            access, correct, export or delete your personal data, and to object to or restrict
            certain processing. Contact us and we will help. You can also complain to your
            local data-protection authority (in the UK, the ICO).
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For help with DoorMan, questions about this policy or a data request, email{' '}
            <a href="mailto:contact@thedoorman.app" className="underline text-foreground">
              contact@thedoorman.app
            </a>
            .
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If we make material changes to this policy we will update this page and change the
            date above.
          </p>
        </Section>
      </div>
    </div>
  );
}
