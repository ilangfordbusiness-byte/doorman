// Public terms of use (EULA). Must be reachable without an account: the
// sign-in screen links here and App Store Guideline 1.2 requires users to
// agree to them. Rendered outside the auth gate in App.jsx.

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-heading font-bold text-lg mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 mb-8 text-sm text-muted-foreground hover:text-foreground">
          <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
          DoorMan
        </a>
        <h1 className="font-heading font-extrabold text-3xl mb-2">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 22 October 2026</p>

        <Section title="Agreement">
          <p>
            DoorMan (thedoorman.app and the DoorMan iOS app) is operated by DoorMan.app Ltd
            ("we", "us"). When you create an account or sign in, you agree to these terms
            and to our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
            If you do not agree, do not use DoorMan.
          </p>
          <p>
            You must be at least 13 years old to use DoorMan. Some events have a higher
            minimum age. The host sets it and the door staff check it.
          </p>
        </Section>

        <Section title="No tolerance for objectionable content or abusive users">
          <p>
            Hosts, businesses and users post content on DoorMan: events, descriptions, cover
            photos, profile photos and chat messages. You are responsible for what you post.
            We do not tolerate objectionable content or abusive behaviour. You must not post
            or send content that:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>harasses, bullies, threatens or intimidates anyone;</li>
            <li>is hateful or discriminates because of race, ethnicity, religion, gender, sexual orientation, disability or any other protected characteristic;</li>
            <li>is sexually explicit or exploits minors in any way;</li>
            <li>promotes violence, self-harm, illegal drugs or other illegal activity;</li>
            <li>is spam, a scam, or a fake or misleading event;</li>
            <li>infringes someone else's copyright, trademark or privacy.</li>
          </ul>
        </Section>

        <Section title="Reporting and blocking">
          <p>
            You can report any event, profile or chat message with the Report button on it,
            and you can block any user. When you block someone, you no longer see their
            events, messages or profile, and they cannot send you a friend request. You can
            unblock people from your profile.
          </p>
          <p>
            We review every report within 24 hours. When content breaks these terms, we
            remove it and we suspend or permanently ban the user who posted it. You can also
            email us at{" "}
            <a href="mailto:contact@thedoorman.app" className="text-primary hover:underline">contact@thedoorman.app</a>.
          </p>
        </Section>

        <Section title="Tickets and payments">
          <p>
            Hosts sell tickets through DoorMan, and Stripe processes the payments. The price
            shown at checkout includes any booking fee. Ticket sales are final unless the
            host cancels the event. For questions about an event, contact its host.
          </p>
          <p>
            A ticket is a QR pass for one entry. You can transfer it to another DoorMan user
            in the app. A pass that is copied or used twice is refused at the door.
          </p>
        </Section>

        <Section title="Hosts">
          <p>
            Hosts are responsible for their events: that the event takes place as described,
            that it is legal, and that it follows venue, licensing and age rules. Hosts must
            not use guest information for anything other than running their events.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            Keep your sign-in details safe. We can suspend or close an account that breaks
            these terms. You can delete your account at any time from Profile, then Delete
            Account.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            We provide DoorMan "as is". We are not responsible for events that hosts run, or
            for content that users post. Nothing in these terms limits liability that the
            law does not allow us to limit. These terms are governed by the laws of England
            and Wales.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms:{" "}
            <a href="mailto:contact@thedoorman.app" className="text-primary hover:underline">contact@thedoorman.app</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
