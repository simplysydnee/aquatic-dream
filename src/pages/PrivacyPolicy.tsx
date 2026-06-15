import SEO from "@/components/SEO";

const PrivacyPolicy = () => {
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title="Privacy Policy — Aquatic Dreams Swim Modesto"
        description="How Aquatic Dreams Swim Modesto collects, uses, protects, and never sells your personal information, including phone numbers used for SMS lesson reminders."
        path="/privacy-policy"
      />
      <section className="bg-gradient-to-br from-primary/10 to-background py-12">
        <div className="container">
          <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">Legal</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-2">Effective May 1, 2025</p>
        </div>
      </section>

      <article className="container py-10 max-w-3xl prose prose-slate">
        <p>
          Aquatic Dreams Modesto, LLC ("Aquatic Dreams," "we," "us," or "our") operates the website
          aquaticdreamsswim.com and related online services (the "Site"). This Privacy Policy
          explains what information we collect, how we use it, how we protect it, and your rights.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">1. Information We Collect</h2>
        <p>When you enroll a student or use the Site, we may collect:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Parent or guardian name, email address, <strong>mobile phone number</strong>, and home address</li>
          <li>Student name, date of birth, age, and swim-skill assessment responses</li>
          <li>Emergency contact name and phone number</li>
          <li>Health and medical information voluntarily disclosed during enrollment</li>
          <li>Payment information (processed securely by Stripe — we do not store full card numbers)</li>
          <li>Account login credentials</li>
          <li>Technical data such as IP address, browser type, device type, and cookies</li>
        </ul>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To process enrollment, manage class bookings, and administer your account</li>
          <li>To collect tuition payments and send billing communications</li>
          <li>
            To send enrollment confirmations, lesson reminders, schedule changes, cancellations,
            and other transactional account messages by email (via Resend) and
            <strong> SMS text message (via TextMagic)</strong> to the phone number you provide
          </li>
          <li>To respond to inquiries and provide customer support</li>
        </ul>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">3. SMS / Text Messaging Data</h2>
        <p>
          When you opt in to SMS during enrollment, we collect your mobile phone number for the
          sole purpose of sending lesson reminders, schedule changes, registration confirmations,
          payment links, and other transactional account messages related to your swimmer.
        </p>
        <p className="mt-2">
          <strong>
            We do not sell, rent, share, or otherwise disclose your mobile phone number or SMS
            opt-in information to any third parties or affiliates for marketing or promotional
            purposes.
          </strong>{" "}
          Mobile information is shared only with our messaging service provider (TextMagic) solely
          to deliver the messages you have requested, and never with third parties for their own
          marketing. No mobile information is shared with third parties or affiliates for
          marketing or promotional purposes.
        </p>
        <p className="mt-2">
          <strong>How to opt out:</strong> You can stop receiving SMS messages from us at any time
          by replying <strong>STOP</strong> to any message. After you reply STOP, we will send one
          final confirmation and you will not receive further SMS messages from us. To rejoin,
          reply <strong>START</strong> or sign up again during enrollment. For help, reply{" "}
          <strong>HELP</strong> or email{" "}
          <a href="mailto:info@aquaticdreamsswim.com">info@aquaticdreamsswim.com</a>. See our{" "}
          <a href="/sms-terms">SMS Terms &amp; Conditions</a> for full details.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">4. How We Share Your Information</h2>
        <p>
          We do not sell, rent, or trade your personal information. We share information only with
          the service providers strictly necessary to operate our services:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Stripe</strong> — payment processing (PCI-DSS Level 1)</li>
          <li><strong>Supabase</strong> — secure cloud database hosting</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>TextMagic</strong> — SMS delivery for lesson reminders and account messages</li>
        </ul>
        <p className="mt-2">
          We may also disclose information if required by law, court order, or governmental
          authority, or in connection with a business transfer (merger, acquisition, sale of
          assets). We do not share student or family data with outside organizations for their
          marketing without your explicit consent.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">5. Data Security &amp; Safeguards</h2>
        <p>We take reasonable technical and organizational measures to protect your information:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Encrypted data transmission across the Site using HTTPS / TLS</li>
          <li>Encrypted-at-rest cloud storage with role-based access controls</li>
          <li>Row-level security policies restricting data to authorized staff only</li>
          <li>Password hashing and secure authentication for parent and staff accounts</li>
          <li>Payment card data handled exclusively by Stripe (PCI-DSS Level 1 certified)</li>
          <li>Regular review of access logs and prompt response to any suspected incident</li>
          <li>Vendor agreements requiring service providers to protect data on our behalf</li>
        </ul>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">6. Children's Privacy (COPPA)</h2>
        <p>
          Our programs serve children under 13. We do not knowingly collect personal information
          directly from children under 13. All enrollment information is collected from and
          managed by a parent or legal guardian.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">7. Cookies &amp; Tracking</h2>
        <p>
          We use essential cookies to operate the Site, analytics cookies to understand usage, and
          preference cookies to remember your settings.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">8. Your Rights (California / CCPA)</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Right to Know</strong> — request the personal information we have collected</li>
          <li><strong>Right to Delete</strong> — request deletion of your personal information</li>
          <li><strong>Right to Opt-Out</strong> — we do not sell personal information</li>
          <li><strong>Right to Non-Discrimination</strong> — we will not deny services for exercising your rights</li>
        </ul>
        <p className="mt-2">
          Contact us at <a href="mailto:info@aquaticdreamsswim.com">info@aquaticdreamsswim.com</a> or{" "}
          <a href="tel:2095773483">(209) 577-3483</a> to exercise these rights.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be
          communicated to enrolled families by email at least 14 days before they take effect.
        </p>

        <h2 className="font-display text-xl font-bold mt-8 mb-2">10. Contact</h2>
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

export default PrivacyPolicy;
