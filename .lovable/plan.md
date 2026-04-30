# Plan — Email Logo Fix + Calendar Swimmer Edit + Front-Desk Waiver Hookup

## 1. Fix logo loading in transactional emails

**Diagnosis**
- All 8 email templates point `LOGO_URL` to `email-assets/AQD_Favicon.png` in Supabase Storage.
- The file is public and returns HTTP 200, but it's **478 KB** for a tiny 80×80 logo. Many email clients (Yahoo, Outlook, mobile clients) silently drop oversized remote images, and Gmail's "images hidden" warning is more aggressive on heavy images. That matches the broken-image placeholder in the Yahoo screenshot you sent.
- Root cause: oversized PNG, not the URL.

**Fix (no other email-format changes)**
- Upload an optimized small PNG (`aqd-email-logo.png`, ~160×160 @ ~10–25 KB) to the `email-assets` bucket via a one-off migration / storage upload.
- Bump `LOGO_URL` constant in all 8 templates to the new file.
- Add a `display: block` style + explicit `width`/`height` HTML attributes (we already pass these) — no other styling/layout changes.
- Redeploy `send-transactional-email` edge function so the new templates take effect.

Templates touched (constant only): `early-access-invite`, `enrollment-confirmation`, `instructor-schedule`, `lesson-booking-confirmation`, `lesson-reminder`, `lesson-request-acknowledgment`, `lesson-request-reply`, `session-payment-link`.

## 2. Calendar event detail — Edit Swimmer (pencil) for private/semi-private bookings

In `src/components/admin/calendar/CalendarBlockDetail.tsx`, inside the existing **Lesson Booking** panel (the block that shows for `private_lesson` / `semi_private_lesson` events):

- Add a small **pencil icon button** next to the swimmer name row.
- Clicking it opens an inline edit form (or compact dialog) with these fields, prefilled from `lesson_bookings`:
  - Child name
  - Parent name
  - Parent email
  - Parent phone
- **Save** updates the `lesson_bookings` row (`update().eq('id', booking.id)`), shows a success toast (`"Swimmer info updated"`), and refetches the booking so the panel reflects new values.
- **Cancel** discards.
- Validation: name + email required; email format check.

Also add the same pencil edit affordance for **swim-class roster entries** (the `isSwim` enrollment cards) — opens an edit dialog that updates `swim_enrollments` (`child_name`, `child_age`, `parent_name`, `parent_email`, `parent_phone`) and refetches.

## 3. Conditional "Complete Waivers" button

There is already a `FrontDeskWaiverDialog` component wired into the lesson-booking panel as **"Open at front desk"**. We will:

- **Rename** the button label to **"Complete Waivers"** with a clipboard/pencil icon to match your wording.
- Keep the existing condition: button only appears when `lessonBooking.waiver_signed_at` is null. (Already correct.)
- Make the button more visible — promote it from the small inline waiver row to a primary-style button at the bottom of the booking panel, alongside the existing actions, so front-desk staff don't miss it.
- For **swim-class enrollments** (group classes), check `enrollment_agreements` for that enrollment. If no agreement exists, show the same **"Complete Waivers"** button on that swimmer's roster card. It opens `FrontDeskWaiverDialog` (or the equivalent enrollment-waiver flow) prefilled for that swimmer; on submit it writes an `enrollment_agreements` row and the button disappears.

No new tables. No schema changes.

## Files to edit

- `supabase/functions/_shared/transactional-email-templates/*.tsx` — LOGO_URL constant only (8 files).
- New asset: upload `aqd-email-logo.png` to `email-assets` storage bucket.
- `src/components/admin/calendar/CalendarBlockDetail.tsx` — add edit swimmer state, edit form, conditional Complete Waivers button placement/label.
- New small component: `src/components/admin/calendar/EditSwimmerDialog.tsx` for the inline edit form (booking + enrollment variants).
- Possibly extend `FrontDeskWaiverDialog` to also handle a `swim_enrollment` target (or add a sibling component) for group-class waivers.

## What stays untouched

- Email template HTML, colors, layout, copy — **no changes** beyond the logo URL constant.
- All other calendar / scheduling logic, payment flow, edge functions besides redeploying the email sender.
