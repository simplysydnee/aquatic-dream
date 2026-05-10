# Account Credits — hardening + manual management

Scope kept narrow per your answers: credits remain redeemable **only** in the admin AddSwimmer dialog. We'll fix the bugs there, then add owner controls to issue/void credits from the swimmer drawer.

## 1. Fix the partial-consume bug in `AddSwimmerDialog.tsx`

Today, when a credit is partially used, the original row's `amount_cents` is overwritten with the consumed amount — that rewrites history. Change `consumeCredits()` so a partial spend:
- Marks the **original row** fully used (`used_at`, `used_against`) without touching `amount_cents` (preserve the audit trail).
- Inserts a new row with `source = "credit_split"` for the unused remainder, referencing the original credit id in `source_ref`.

Add a guarded update (`.is("used_at", null)`) on every consume so two simultaneous admin enrollments can't double-spend the same row. If the update affects 0 rows, refetch credits and abort with a toast: "Credit was already used — please retry."

## 2. Tighten the redemption UX in AddSwimmer

- Show "Applying $X.XX of $Y.YY available" inline so the staffer sees what will be consumed before clicking Enroll.
- Disable the Apply checkbox if `paymentAmount` is empty/0.
- If `applyCredit && netDue === 0`, hide the Reference field's required marker (already partially handled — verify and clean up).
- After successful consume, refresh CreditsSection if the swimmer drawer is open.

## 3. Manual credit management in the swimmer drawer

Upgrade `CreditsSection.tsx` from read-only to manage:

**Issue credit** button (admins only):
- Modal with: amount ($), reason dropdown (`goodwill`, `manual_adjustment`, `transfer_in`, `other`), free-text note (required).
- Inserts row with `source = "manual_issue"`, `created_by = auth.uid()`, parent_email lowercased.

**Void** action on each unused row:
- Confirms, then sets `used_at = now()`, `used_against = "voided"`, appends void reason to `note`.
- Only available when `used_at IS NULL`.
- Records `created_by` of the void in note (`Voided by <email> — <reason>`).

**Visual polish**:
- Group ledger into "Available" and "History" sections.
- Show running balance.

## 4. Database — minor schema touch

One migration:
- Add `voided_at timestamptz` and `voided_by uuid` columns to `client_credits` (cleaner than overloading `used_at` for voids).
- Add `voided_reason text`.
- Update `unusedTotal` queries everywhere to filter `used_at IS NULL AND voided_at IS NULL`.
- Backfill: nothing to backfill.

## 5. Out of scope (per your decisions)

- Public enrollment checkout, `create-lesson-occurrence-checkout`, and `send-session-payment-link` will **not** learn about credits. If a parent wants to use a credit, staff must run AddSwimmer manually.
- No credit expiration logic.
- No customer-facing credit display.

## Technical details

**Files touched**
- `supabase/migrations/<new>.sql` — add `voided_at`, `voided_by`, `voided_reason` to `client_credits`.
- `src/components/admin/calendar/AddSwimmerDialog.tsx` — fix `consumeCredits`, add guarded update, UX polish.
- `src/components/admin/swimmer/tabs/CreditsSection.tsx` — split into ledger view + actions; integrate new dialogs.
- `src/components/admin/swimmer/tabs/IssueCreditDialog.tsx` (new) — issue form.
- `src/components/admin/swimmer/tabs/VoidCreditDialog.tsx` (new) — confirm + reason.

**RLS** — existing "Admins manage client credits" policy already covers insert/update; no new policies needed.

**No edge function changes.** All credit operations stay client-side under admin RLS.
