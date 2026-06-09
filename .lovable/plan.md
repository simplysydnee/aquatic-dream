## Prorated session-fee payment links + admin confirmation dialog

Today the "Send Payment Link" buttons fire instantly and always charge the full session price ($240). Late enrollees should pay **$30 × remaining lessons** instead, and admins should be able to review/edit the amount and choose whether to include the waiver link in the same email.

### 1. Compute remaining lessons (shared helper)
- New helper `getRemainingLessonsForSession(sessionId)` that reads `session_lesson_dates` where `is_cancelled = false` and `lesson_date >= today` (America/Los_Angeles).
- Suggested charge = `Math.max(remaining, 1) * 30` (floor at 1 lesson so we never send a $0 link). Full 8/8 falls back to `swim_sessions.session_price` so existing behavior is unchanged for normal enrollments.

### 2. New "Send Payment Link" confirmation dialog
Replace the one-click handlers in:
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` (`sendPaymentLink`)
- `src/components/admin/EnrollmentDetailDialog.tsx` ("Send $240 Session Fee Payment Link")
- `src/components/admin/swimmer/tabs/PaymentsTab.tsx`

Dialog shows:
- Child + session name, session start date
- "Remaining lessons: X of 8" with computed `$X * $30 = $Y`
- **Editable amount field** (USD, prefilled with suggested amount, min $1)
- Short rationale line: "Prorated: 5 remaining lessons × $30 = $150"
- Quick presets: `Full ($240)` / `Prorated ($Y)` / `Custom`
- **Checkbox: "Include waiver signing link in the email"** — defaults checked when `enrollment.waiver_signed_at` is null AND `is_first_time = true`; otherwise unchecked
- Buttons: Cancel / Send

### 3. Backend: `send-session-payment-link`
- Accept new body fields: `amountOverrideCents` (already supported) and `includeWaiverLink: boolean`.
- When `includeWaiverLink` is true: ensure the enrollment has a `waiver_token` (generate via existing trigger logic / direct insert if missing) and pass `waiverLink` into the `session-payment-link` template data.
- Pricing source of truth stays DB-driven (uses `amountOverrideCents` from the dialog so admins always see exactly what they approved). Removes the `swim_session_fee` lookup_key drift path entirely.
- Email subject/body uses the same `chargeAmount` as the Stripe line item.

### 4. Template update
- `supabase/functions/_shared/transactional-email-templates/session-payment-link.*`: add optional `waiverLink` block ("Please also complete the waiver before your first lesson: [link]"). Render only when provided.

### 5. Verification
- 8/8 remaining → suggested $240, current behavior preserved.
- 5/8 remaining → suggested $150; email + Stripe both show $150.
- Toggle waiver checkbox → email contains/omits waiver section.
- Custom override (e.g. $200) → Stripe charges $200, email body matches.

### Out of scope (call out)
- Public enrollment checkout still charges full session price. If you want the prorated price to also apply on self-serve enrollment for partially-started sessions, that's a follow-up.
