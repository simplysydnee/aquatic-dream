## Investigation Summary

### Bug 1 — Expired Payment Links
**Root cause:** Stripe Checkout Sessions default to expiring **24 hours** after creation when `expires_at` is not set. The following edge functions create sessions without `expires_at`:

- `supabase/functions/send-lesson-booking-confirmation/index.ts`
- `supabase/functions/send-lesson-series-confirmation/index.ts`
- `supabase/functions/send-session-payment-link/index.ts`
- `supabase/functions/create-lesson-occurrence-checkout/index.ts`
- `supabase/functions/create-checkout/index.ts`

Stripe's max allowed `expires_at` is **30 days** from creation, so we can extend to that ceiling. Any link emailed to a parent currently becomes invalid the next day.

### Bug 2 — Waiver Not Reflecting (Zayne / Katelyn)
**Findings from DB inspection:**
- `lesson_bookings.id = e50aa425…` (child = "Zayne Sanchez", parent = Katelyn Bettencourt, kbett.2412@gmail.com), `series_start = 2026-05-11`, `series_end = 2026-05-18`.
- `waiver_signed_at = 2026-05-11 15:45` ✅ — the DB **already** has the waiver marked signed.
- `enrollment_agreements` row exists, `signer_email = kbett.2412@gmail.com` (matches the booking parent_email).
- Two `lesson_booking_occurrences` exist (5/11 and 5/18), both `unpaid`.

**So the matching is NOT email-based — it is token-based** (`waiver_token` → `lesson_bookings.id`), and it worked correctly. The actual bug is **Bug 3**: there is no surface anywhere in the swimmer/student profile that shows the waiver status, so admin assumed it wasn't done.

For group `swim_enrollments`, agreements are matched by `enrollment_id` at enrollment time. There is currently **no admin path to mark a waiver complete after the fact** if it was signed under a different identity or imported manually.

### Bug 3 — Waiver & Photo Approval Missing from Profile
- `SwimmerDetailDrawer.tsx`, `SwimmerModalProvider.tsx`, and all `swimmer/tabs/*.tsx` files contain **zero references** to `waiver`, `agreement`, or `photo_release`.
- `enrollment_agreements.photo_release_accepted` (boolean) exists but is never read in the frontend.
- For lesson bookings, `CalendarBlockDetail` shows waiver status per-booking, but the swimmer profile (the natural place to look) does not.

---

## Plan

### 1. Fix payment link expiration (Bug 1)

Add `expires_at` to all four Stripe Checkout Session creations (max 30 days):

```ts
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const session = await stripe.checkout.sessions.create({
  // …existing fields…
  expires_at: Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS,
});
```

Files to edit:
- `supabase/functions/send-lesson-booking-confirmation/index.ts`
- `supabase/functions/send-lesson-series-confirmation/index.ts`
- `supabase/functions/send-session-payment-link/index.ts`
- `supabase/functions/create-lesson-occurrence-checkout/index.ts` (embedded — `expires_at` still applies)

Note: `create-checkout` (initial enrollment) is consumed within minutes during the live flow, so the 24h default is acceptable there — but we'll bump it to 30 days too for consistency.

### 2. Add a new "Mark waiver complete" admin action (Bug 2)

Add a `Tab` / section on the swimmer profile that lists all waiver records found for that swimmer (by lesson booking + by enrollment) and lets admin:

- See signed/unsigned status with signer name + email + timestamp
- Click **"Mark waiver complete (manual)"** when no agreement exists — this opens a small dialog capturing signer name + reason/notes, and inserts a row into `enrollment_agreements` with `signer_email = parent_email`, `signer_name = <admin entry>`, all consent flags = true, and a note in `signature_text` like `"Manually marked complete by admin: <reason>"`.
- For lesson bookings: also stamp `lesson_bookings.waiver_signed_at = now()`.

This requires a new admin-only edge function `admin-mark-waiver-complete` (so we can bypass RLS and stamp `lesson_bookings.waiver_signed_at`):
- Auth: verify caller has `admin` role via `has_role(auth.uid(),'admin')`.
- Input: `{ targetType: 'lesson_booking' | 'enrollment', targetId: uuid, signerName: string, note: string }`.
- Inserts agreement row + (if lesson booking) updates `waiver_signed_at`.

### 3. Surface waiver + photo approval on swimmer profile (Bug 3)

Add a "Compliance" / "Waivers" panel to the swimmer drawer (`SwimmerDetailDrawer.tsx` and the modal-provider tabs) showing **at a glance**:

- **Waiver:** ✅ Completed (date, signer) / ⚠️ Not completed → with [Mark complete] button
- **Photo release:** ✅ Approved / ❌ Declined / ⚪ Not answered
- **Emergency contact:** name + phone (already in DB)

Data source: aggregate `enrollment_agreements` joined to the swimmer's `swim_enrollments` and `lesson_bookings` (matched by `child_name + parent_email`, plus direct id joins). Show the most recent agreement and surface badges on the profile header so it's visible without expanding any section.

Add small status badges to the swimmer list/cards too (✅/⚠️ icon next to the name) so admins can scan rosters.

### 4. Verification
- Open Zayne's profile → confirm waiver shows ✅ "Signed 5/11" with photo release badge.
- Open another swimmer with no agreement → confirm "Not completed" + working "Mark complete" button writes a row and badge flips.
- Resend payment link from CalendarBlockDetail → check Stripe dashboard shows the new session has `expires_at` set ~30 days out.
- Existing already-expired links: admin can use the "Resend link" button on the occurrence to generate a fresh one.

---

## Continuation prompt (for after checkpoint approval)

> Proceed with implementing the plan:
> 1. Add `expires_at` (30 days) to all four Stripe checkout session creations.
> 2. Create the `admin-mark-waiver-complete` edge function (admin-role gated).
> 3. Add a "Compliance" panel + status badges to `SwimmerDetailDrawer` and the swimmer modal tabs showing waiver, photo release, and emergency contact, with a "Mark waiver complete" dialog.
> 4. Verify against Zayne's record and confirm a fresh payment link in Stripe shows a ~30-day `expires_at`.
