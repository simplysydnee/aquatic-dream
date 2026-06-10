## Goal
Build a **new dedicated template** `lesson-booking-confirmation-manual` for any admin-booked private/semi-private lesson where the parent has NOT paid yet and just needs to save a card on file. Reusable for all future manual bookings — not a flag on the existing template.

## Why a separate template (not a flag)
- Different intent: parent didn't self-checkout, an admin booked them. Copy should reflect that ("We've booked Kiaan for…").
- Different CTA: "Save Card on File" (Stripe setup link), not "Pay Now".
- Different body line: "No charge today — we'll automatically charge {amount} on lesson day."
- Keeps the existing `lesson-booking-confirmation` (self-serve paid path) untouched and safe.

## Changes

### 1. New file: `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation-manual.tsx`
- Branded like `lesson-booking-confirmation` (same header, colors, container, lesson-details card, cancellation policy footer).
- Props: `parentName`, `childName`, `instructorName`, `lessonTypeLabel` ("Private Lesson" | "Semi-Private Lesson"), `lessonDate`, `lessonTime`, `amountDue`, `paymentLink` (Stripe setup URL), optional `notes`.
- Subject: `"Private Lesson Booked — {lessonDate} — Aquatic Dreams"` (dynamic on lessonTypeLabel).
- Preview: `"Your lesson is booked — save a card on file"`.
- Body intro: `"We've booked {childName} for a {lessonTypeLabel} with {instructorName}."`
- Highlight line: `"No charge today — we'll automatically charge {amountDue} on lesson day."`
- Primary CTA button → `paymentLink` labeled **"Save Card on File"** (same button styling as existing template).
- Includes `previewData` so it renders immediately on `/admin/emails`.

### 2. `supabase/functions/_shared/transactional-email-templates/registry.ts`
- Register the new template under key `lesson-booking-confirmation-manual` with `displayName: "Lesson Booking Confirmation (Manual / Card on File)"`.

### 3. `supabase/functions/admin-card-on-file-link/index.ts`
- Swap `templateName` from `admin-freeform` → `lesson-booking-confirmation-manual`.
- Build `templateData` from the booking row.
- Same Stripe setup-session creation logic stays as-is.

### 4. Deploy & preview (STOP here for your review)
- Deploy `preview-transactional-email`, `send-transactional-email`, `admin-card-on-file-link`.
- You refresh `/admin/emails`, open "Lesson Booking Confirmation (Manual / Card on File)", confirm layout + button.

### 5. After your approval
- Re-invoke `admin-card-on-file-link` for booking `95be6665-a982-46b5-a4d9-ac177f3037fe` → Sandeep gets the new branded email. Same Stripe link, same $50 auto-charge on lesson day.

## Reusability
Any future admin manual booking flow (private or semi-private, no payment captured) calls `admin-card-on-file-link` (or any function) with `templateName: 'lesson-booking-confirmation-manual'` and the booking's data. One template covers all of it.

## Out of scope
- No DB / schema changes.
- No change to the existing self-serve `lesson-booking-confirmation` template.
- No change to the Stripe setup flow itself.
