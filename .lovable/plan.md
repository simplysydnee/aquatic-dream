## Goal
On `/admin/private-lessons/new`, when booking a **semi-private** lesson, let admins pick the 2nd swimmer from existing clients/lesson requests (same search UX as step 1) or add manually. If the 2nd swimmer's parent email differs from the primary parent, send them a copy of the booking confirmation.

---

## 1. BookingWizard — 2nd swimmer picker (TypeStep, semi-private branch)

Replace the current 4 plain inputs with a two-mode panel:

- **Find existing** (default) — search input that runs the same parallel queries as `ClientStep`:
  - `lesson_bookings` (private/semi-private history)
  - `swim_enrollments` (group lessons)
  - `lesson_requests` (open requests, statuses `new`/`contacted`)
  - Dedupe by `email|child_first|child_last`, show swimmer name first (bold), parent name + email/phone as subtitle, and a source chip (Private / Group / Request).
  - Clicking a result fills `client.swimmers[1]` with `{ first_name, last_name, age, dob, partner_parent_name, partner_parent_email, partner_parent_phone }`.
- **Add manually** — existing 4 inputs, plus optional "2nd swimmer's parent" fields (name, email, phone) shown in a collapsible "Different parent? Notify them" sub-section.
- Confirmation row with "Change" button mirroring step 1.

The primary parent (step 1) remains the payer and card-on-file holder. The 2nd swimmer's parent contact is metadata only.

### Type changes
Extend `Swimmer` in `BookingWizard.tsx`:
```ts
partner_parent_name?: string
partner_parent_email?: string
partner_parent_phone?: string
```

---

## 2. Pass partner-parent contact through to the booking

`admin-create-private-booking` edge fn already accepts the swimmer pair. Add an optional `partner_parent_email` (+ name/phone) field to its payload, and store it on the `lesson_bookings` row.

### DB change
Migration on `lesson_bookings`:
- `partner_parent_name text`
- `partner_parent_email text`
- `partner_parent_phone text`

No RLS change needed (admin-only writes; reads already gated).

---

## 3. Send confirmation to 2nd parent

Update `supabase/functions/_shared/send-private-booking-confirmation.ts`:

- After the existing primary-parent send succeeds, check if `booking.lesson_type` is semi-private AND `booking.partner_parent_email` is set AND it normalizes differently from `booking.parent_email` (case-insensitive, trimmed).
- If so, invoke `send-transactional-email` a second time with:
  - `recipientEmail: booking.partner_parent_email`
  - `idempotencyKey: \`private-booking-partner-${booking_id}\`` (or `-resend-${ts}` in resend mode)
  - Same `templateData`, but swap `parentName` → `partner_parent_name` (fallback "there"), and swap `childName` → the 2nd swimmer's first name (pulled from booking — see note below).
- Log failures the same way as the primary send (no DB status field for partner send; just console.error). Primary send status remains the source of truth in `lesson_bookings.confirmation_email_status`.

### Note — 2nd swimmer name on booking
The booking record stores only one `child_first_name/child_last_name`. We need the 2nd swimmer's name for the partner email. Options:
- (a) Store the 2nd swimmer in a new `lesson_bookings.partner_swimmer_name text` column (simplest, aligns with partner_parent_* fields). **Recommended.**
- (b) Read from `lesson_booking_swimmers` if such a table exists — it does not today.

Plan uses option (a): add `partner_swimmer_first_name` / `partner_swimmer_last_name` columns alongside the partner_parent_* fields and have `admin-create-private-booking` write them from `client.swimmers[1]`.

---

## 4. Files touched

- `src/components/admin/booking/BookingWizard.tsx` — extend `Swimmer`, add `SecondSwimmerPicker` subcomponent, replace the 4-input row.
- `supabase/functions/admin-create-private-booking/index.ts` — accept and persist new partner fields.
- New migration — add 5 columns to `lesson_bookings`.
- `supabase/functions/_shared/send-private-booking-confirmation.ts` — second send when partner email differs.

No template change required — the existing `lesson-booking-confirmation` template renders fine with swapped `parentName`/`childName`.

---

## Out of scope
- No split billing — primary parent's card is still charged for both swimmers.
- No partner-parent reminder emails (only the initial confirmation + manual resend).
- No partner waiver link — waivers stay tied to the primary booking.
