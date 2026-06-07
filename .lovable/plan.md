## Goal
When a session is full, the parent gets a waitlist confirmation only — never anything that sounds like they were enrolled in a private lesson. From the fallback screen and the email, they have two clear, self-directed choices:

1. **Pick a different session** (group)
2. **Choose to book a private lesson** (parent-initiated, separate checkout)

## Changes

### 1. `waitlist-confirmation.tsx` (parent email) — rewrite copy
- New H1: **"We got your waitlist request"**
- Add explicit line up top: **"You have not been enrolled or charged for anything yet."**
- Reframe the private-lesson block from a promo CTA into an *optional choice*:
  - Title: **"Want a private lesson instead?"**
  - Body: "If you'd rather not wait, you can choose to book a private lesson on your own at $50/lesson (June promo). Nothing is booked unless you complete checkout yourself."
  - Keep the "Book a private lesson" button.
- Keep the "check other group sessions" link as the second option.
- Update `Preview` and `subject` to "We got your waitlist request — Aquatic Dreams".

### 2. `waitlist-owner-alert.tsx` (owner email) — small clarification
Add one line so the owner sees the parent state matches: "Parent has been told they are on the waitlist only; no enrollment or charge was created."

### 3. `SessionFullFallback.tsx` (in-app screen) — copy tightening
- Headline stays "This session is full".
- After the waitlist auto-submit succeeds, show: **"You're on the waitlist. We have not enrolled you or charged you for anything."**
- Present two equal CTAs side-by-side:
  - **Pick a different session** (returns to session picker)
  - **Book a private lesson instead** (links to private booking flow)
- Remove any wording that frames private as automatic or as a promo we're applying for them.

### Out of scope
- No DB schema changes.
- No changes to `submit-waitlist-request` logic — it still inserts a `waitlist_requests` row and emails parent + owner.
- No pricing or payment logic changes.

## Files touched
- `supabase/functions/_shared/transactional-email-templates/waitlist-confirmation.tsx`
- `supabase/functions/_shared/transactional-email-templates/waitlist-owner-alert.tsx`
- `src/components/swim-enrollment/SessionFullFallback.tsx`
