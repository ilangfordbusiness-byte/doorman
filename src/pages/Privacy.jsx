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
        <p className="text-sm text-muted-foreground mb-10">Last updated: 25 August 2026</p>

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
          <p>We do not sell your personal information or use it for third-party advertising.</p>
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
            authentication and file storage), Stripe (payments), Resend (email delivery) and
            Vercel (hosting). Each receives only what it needs to provide its service.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            We keep your data while your account is active. To delete your account and
            associated personal data, contact us — we will remove it except where we must
            keep records (for example, payment records required for tax and accounting).
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            We use browser storage only to keep you signed in. We do not use advertising or
            cross-site tracking cookies.
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
