# Private / Semi-Private Lesson Booking — Round 2

## 1. Answer your "fix resend environment" question

That phrasing in the toast was just a generic copy fragment from the existing send flow — there is no actual prompt the user sees called "fix resend environment". What's happening internally:

- The booking dialog passes `environment: getStripeEnvironment()` (auto-detected: `sandbox` in preview, `live` in production) to the `send-lesson-booking-confirmation` function.
- The "Resend payment link" button on the calendar block was hard-coded to `environment: "sandbox"` — that's a bug. It will keep working in preview but in production it would create sandbox checkout links instead of live ones.

**Fix:** Replace the hard-coded `"sandbox"` in `CalendarBlockDetail.tsx` with `getStripeEnvironment()`, same as the booking dialog. Now both initial send + resend always pick the right environment automatically — no prompt, no manual toggle needed.

## 2. Waivers for private / semi-private lessons

Today the legal waiver/agreement (liability, photo release, ToS, privacy, signature, emergency contact) only runs through the public group-enrollment flow. Private/semi-private bookings created from the admin calendar bypass it entirely — that's a compliance gap.

### How parents will sign

1. **Automatic on first booking**
   - When the booking dialog creates a new `lesson_bookings` row, also create a one-time `waiver_token` (random uuid, 60-day expiry, unique link).
   - The booking confirmation email — which already goes out for the first occurrence — gets a new top section: **"Step 1: Sign your waiver"** with a button linking to `/lesson-waiver/{token}`.
   - The Stripe payment button stays as **"Step 2: Pay for your first lesson"** in the same email.
   - We do NOT block payment on signing, so a parent can pay first and sign later (or vice versa). Both states are tracked.

2. **Public waiver page** `/lesson-waiver/:token`
   - Reuses the existing `<LegalAgreements>` component verbatim (same waiver, photo release, ToS, privacy, signature, emergency contact — same versions you use for group enrollment).
   - Pre-fills parent + child name from the booking.
   - On submit, writes to `enrollment_agreements` with the booking link (see schema note below) and marks `lesson_bookings.waiver_signed_at = now()`.
   - Shows a "Waiver complete" success state.

3. **Front-desk fallback**
   - In the calendar block's Lesson Booking panel (the same panel that shows Paid/Unpaid + Charge Card), add a **Waiver** row:
     - **Signed** badge with date if complete.
     - **Not signed** + two buttons if not:
       - **Resend waiver email** (re-sends the waiver link to parent's email)
       - **Open at front desk** — opens a full-screen kiosk dialog with the same `<LegalAgreements>` form so a customer can sign on the studio's tablet/computer right there.
   - The "Open at front desk" flow signs against the same token and writes the same `enrollment_agreements` row, so there's a single source of truth no matter where they signed.

### Schema change

The existing `enrollment_agreements` table has `enrollment_id uuid NOT NULL` referencing `swim_enrollments`. To re-use it for lesson bookings without breaking group enrollments:

- Make `enrollment_id` nullable.
- Add `lesson_booking_id uuid` (nullable) referencing `lesson_bookings`.
- Add a CHECK constraint: exactly one of `enrollment_id` / `lesson_booking_id` must be set.
- Add `lesson_bookings.waiver_signed_at timestamptz` and `lesson_bookings.waiver_token text unique`.
- Update the "Anyone can submit enrollment agreements" RLS policy is already permissive — fine to keep. Add a SELECT policy so the public waiver page can read its own booking by token (no PII beyond names).

## 3. Files touched

**New**
- `supabase/migrations/<ts>_lesson_waivers.sql` — schema + token-lookup RPC.
- `src/pages/LessonWaiver.tsx` — public `/lesson-waiver/:token` page.
- `src/components/admin/calendar/FrontDeskWaiverDialog.tsx` — kiosk-mode wrapper around `<LegalAgreements>`.

**Edited**
- `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx` — add "Sign waiver" CTA above the payment CTA, conditional on unsigned.
- `supabase/functions/send-lesson-booking-confirmation/index.ts` — generate/reuse waiver token, pass `waiverLink` to template.
- `src/components/admin/calendar/AddPoolEventDialog.tsx` — generate waiver token on insert.
- `src/components/admin/calendar/CalendarBlockDetail.tsx` —
  - replace hard-coded `"sandbox"` with `getStripeEnvironment()` (the "environment" fix),
  - add Waiver section with badge + Resend + Open-at-front-desk buttons.
- `src/App.tsx` — register `/lesson-waiver/:token` route.

## 4. What the parent sees

```text
Email subject: Your private lesson is booked — please sign & pay

  ┌─────────────────────────────────────┐
  │  Hi Sarah,                          │
  │  Aiden's first private lesson is    │
  │  Tue Jun 10 at 4:00 PM.             │
  │                                     │
  │  Step 1 — Sign waiver               │
  │  [ Sign waiver ]                    │
  │                                     │
  │  Step 2 — Pay for first lesson      │
  │  [ Pay $65 ]                        │
  │                                     │
  │  (Future lessons get their own pay  │
  │   link 24 h before each session.)   │
  └─────────────────────────────────────┘
```

After approval I'll implement everything in one pass and redeploy the affected edge functions.