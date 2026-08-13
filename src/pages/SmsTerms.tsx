import SEO from "@/components/SEO";

const SmsTerms = () => {
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title="SMS Terms & Conditions — Aquatic Dreams Swim Modesto"
        description="SMS messaging terms for Aquatic Dreams Swim Modesto. Learn how lesson reminders and account texts work, message rates, and how to opt out."
        path="/sms-terms"
      />
      <section className="bg-gradient-to-br from-primary/10 to-background py-12">
        <div className="container">
          <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">Legal</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">SMS Terms & Conditions</h1>
          <p className="text-sm text-muted-foreground mt-2">Effective June 8, 2026</p>
        </div>
      </section>

      <article className="container py-10 max-w-3xl prose prose-slate">
        <h2 className="font-display text-xl font-bold mt-8 mb-2">Program Description</h2>
        <p>
          Aquatic Dreams Swim Modesto ("Aquatic Dreams", "we", "us") operates an SMS messaging
          program to send swim-lesson reminders, schedule changes, cancellations, registration
          confirmations, payment links, and other transactional account messages to parents and
          guardians who have enrolled a swimmer with us.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">How to Opt In</h2>
        <p>
          You opt in by checking the box labeled{" "}
          <em>"I agree to receive SMS text messages from Aquatic Dreams Swim Modesto about my
          swimmer's lessons, schedule changes, reminders, and account updates at the phone number
          I provided"</em> during online enrollment at{" "}
          <a href="https://aquaticdreamsswim.com/join">
            https://aquaticdreamsswim.com/join
          </a>{" "}
          and providing your mobile phone number. The opt-in checkbox is unchecked by default and
          must be actively selected by the parent or guardian. Consent is not a condition of
          enrolling your swimmer — you may decline SMS and we will reach you by phone or email
          instead.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Message Frequency</h2>
        <p>
          Message frequency varies based on your swimmer's schedule. You can typically expect 1–4
          messages per week during an active session (lesson reminders, schedule notes) and
          occasional messages between sessions (registration windows, account updates).
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Message and Data Rates</h2>
        <p>
          <strong>Message and data rates may apply.</strong> Aquatic Dreams does not charge for SMS
          messages, but your wireless carrier may charge you for sending and receiving text
          messages according to your plan.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">How to Opt Out</h2>
        <p>
          You can cancel SMS messages at any time by replying <strong>STOP</strong> to any message
          you receive from us. After you send STOP, we will send you one final message confirming
          that you have been unsubscribed. After that, you will no longer receive SMS messages from
          us. To rejoin, sign up as you did the first time or reply <strong>START</strong>.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Help</h2>
        <p>
          If you experience any issues with the messaging program, reply <strong>HELP</strong> for
          assistance, or contact us at{" "}
          <a href="mailto:info@aquaticdreamsswim.com">info@aquaticdreamsswim.com</a> or{" "}
          <a href="tel:2095773483">(209) 577-3483</a>.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Carriers</h2>
        <p>
          Carriers are not liable for delayed or undelivered messages. Supported carriers include
          AT&T, Verizon Wireless, T-Mobile, Sprint, U.S. Cellular, and most regional carriers.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Privacy</h2>
        <p>
          We do not share your mobile phone number or SMS opt-in information with third parties or
          affiliates for marketing or promotional purposes. SMS messages are sent through our
          messaging provider (TextMagic), which acts as a service processor on our behalf. See our{" "}
          <a href="/privacy-policy">Privacy Policy</a> for full details on how we collect, use,
          protect, and never sell your personal information.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">Contact</h2>
        <p>
          Aquatic Dreams Modesto, LLC<br />
          1212 Kansas Ave, Modesto, CA 95351<br />
          <a href="tel:2095773483">(209) 577-3483</a> ·{" "}
          <a href="mailto:info@aquaticdreamsswim.com">info@aquaticdreamsswim.com</a>
        </p>
      </article>
    </main>
  );
};

export default SmsTerms;
