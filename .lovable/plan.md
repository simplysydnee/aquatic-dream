## Add Refund Policy

### 1. Update Terms of Service (`src/components/swim-enrollment/legal-content.ts`)

Replace the outdated Section 2 (which references monthly $120 tuition that no longer exists) with up-to-date Tuition + Refund language matching the actual $45 reg + $240 session model. Bump `TOS_VERSION` to `"2026-04-24"` so any existing acceptances re-prompt.

New Section 2 + new Section 3:

```
2. Enrollment, Tuition & Billing
• One-time $45 registration fee per new swimmer, due at enrollment, non-refundable. Includes swim bag, cap, and goggles.
• Session fee $240 per swimmer for an 8-lesson session.
• New swimmers: $240 session fee due on the first day of lessons (cash, check, or secure payment link).
• Returning swimmers: $240 session fee paid at time of enrollment via Stripe.
• Enrollment is not confirmed until payment is received.

3. Refund Policy
• Registration fee ($45): one-time and NON-REFUNDABLE.
• Session fees ($240): non-refundable once paid, except in documented circumstances (illness with doctor's note, injury, relocation). Written request to info@aquaticdreamsswim.com BEFORE the second lesson; reviewed case-by-case; prorated when approved.
• Missed lessons / no-shows: NO refund, credit, or makeup.
• Cancellations by Aquatic Dreams (weather, facility, instructor): we reschedule or issue a credit; no cash refunds when reschedulable.
• Level changes after first lesson: we move the swimmer at no extra charge — not grounds for a refund.
```

Existing sections 3-14 renumber to 4-15.

### 2. Enrollment confirmation email (`enrollment-confirmation.tsx`)

Add a small "Refund Policy" muted-text block above the contact line:

> **Refund Policy:** Registration fee is non-refundable. Session fees are non-refundable once paid, except in documented circumstances. Missed lessons and no-shows are not refunded. Full policy at aquaticdreamsswim.com/swim-enrollment.

### 3. Session payment link email (`session-payment-link.tsx`)

Add one muted line below the payment button:

> Session fees are non-refundable once paid. No-shows and missed lessons are not refunded.

### 4. Public swim lessons page (`src/pages/SwimLessons.tsx`)

Add a "Pricing & Refund Policy" card near the existing pricing/CTA section so families see the policy *before* they enroll. Mirrors the TOS Section 3 wording in scannable bullet form.

### Deploy & verify
- Redeploy `send-transactional-email` so the updated email templates are live.
- Send a fresh test confirmation + payment-link email to **sydnee@icanswim209.com** so you can see the new copy.

### Not doing
- ❌ No DB migrations
- ❌ No Stripe refund automation — refunds remain manual via Stripe dashboard
- ❌ No new route — refund policy lives inside TOS + on the lessons page

**Approve to implement.**