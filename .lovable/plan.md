

Yes — `send-session-payment-link` already exists. Looking at it: it creates a Stripe checkout for `swim_session_fee` and emails the parent. So "pay the $240 via Stripe day 1" is already wired — we just need to surface it in the UI and make the data model reflect that the session fee is its own thing.

## The model (final)

Add **`session_fee_status`** to `swim_enrollments`:
- Values: `'paid'` | `'due_day_1'` | `'comp'`
- Default: `'due_day_1'` (rule: first-timers always owe $240 day 1)
- Returning swimmers get `'paid'` set by the webhook at checkout

`payment_status` continues to mean **registration fee** (paid / unpaid / waived / not_required).

## Webhook updates (`payments-webhook/index.ts`)

Already writes the row on `checkout.session.completed`. Extend it to:
- **Returning row** → `session_fee_status = 'paid'` (Stripe collected $240), `stripe_payment_id` recorded (already does this)
- **First-time row** → `session_fee_status = 'due_day_1'`, reg fee `payment_status = 'paid'` with `stripe_payment_id`
- **Session-fee follow-up payment** (metadata `type: 'session_fee'` from `send-session-payment-link`) → flip `session_fee_status = 'paid'`, store `session_fee_stripe_id` + `session_fee_paid_at`

This keeps the hard rule: **only the webhook writes paid statuses for Stripe-flow rows.** No bypass.

## Admin UI (`SwimEnrollmentsAdmin.tsx` + `EnrollmentDetailDialog.tsx`)

**Per-row badges** (replaces single confusing status):
- Reg Fee: Paid / Waived / N/A
- Session Fee: Paid / Due Day 1 / Comp

**Per-row action button** "Send $240 Payment Link" — visible when `session_fee_status = 'due_day_1'`. Calls existing `send-session-payment-link` edge function. Disabled for 24h after last send (uses existing `payment_reminder_sent_at`).

**Manual mark-paid** (cash/check at door): admin dropdown changes session_fee_status → `paid`, requires `payment_method` + `payment_reference`. Recorded in audit notes.

## Dashboard cards

- **Owed Now** = unpaid reg fees (×$45) + returning rows stuck in `due_day_1` (Mejia grace ×$240). Shrinks to $0 as Mejia pays.
- **Day-1 Collection** = COUNT(`session_fee_status = 'due_day_1'`) × $240. Today: $1,200 (5 rows). Drops as each $240 comes in (Stripe link OR cash).
- **Capacity** = classes with ≥1 enrollment / total classes (already fixed).

## Backfill (8 rows)

| Row | session_fee_status |
|---|---|
| Aniya (returning, paid in full) | `paid` |
| Destiny (paid reg) + Kade + Fallon + Destiny-unpaid (first-timers) | `due_day_1` |
| Mejia ×2 (returning grace) | `due_day_1` |

## Files touched

- New migration: add `session_fee_status` + `session_fee_stripe_id` + `session_fee_paid_at` columns; backfill 8 rows
- `supabase/functions/payments-webhook/index.ts` — set session_fee_status per flow type; handle `metadata.type === 'session_fee'` callback
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — split badges, dual dropdowns, "Send Payment Link" row action, fixed cards
- `src/components/admin/EnrollmentDetailDialog.tsx` — show/edit both fields, payment-link button, audit log entries
- `mem://features/payment-flow` — document: first-time session fee is ALWAYS `due_day_1`; collected via Stripe link OR cash; webhook is the only writer for `paid`

## Not doing

- ❌ No new edge function (`send-session-payment-link` already exists)
- ❌ No changes to `create-checkout` (charging logic correct)
- ❌ No way to set `session_fee_status='paid'` without either a Stripe webhook event OR an admin-recorded payment_reference (cash receipt)

