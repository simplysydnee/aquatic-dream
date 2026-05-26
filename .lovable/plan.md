## What's wrong today

On the calendar group-class block, each enrolled swimmer shows a single green **"Paid"** badge as soon as `swim_enrollments.payment_status = 'paid'`. That column only tracks the **$45 registration fee**. The **$240 session fee** lives on a different column (`session_fee_status`, default `'due_day_1'`) and is ignored by this view. So first-timers who paid only the reg fee show "Paid" even though they owe $240 on day 1 — exactly the confusion you described at startup.

The block also only offers one action ("Send Payment Link" → reg-fee email) and "Complete Waivers" (opens an in-app waiver form on the current device — good, keep). There is no quick way to: send a waiver-only link by email, mark a session fee paid by cash/check, or run a card right now.

## What this plan changes

All changes are inside the calendar block (`CalendarBlockDetail.tsx`) for group classes. The Payments tab in the swimmer drawer stays as the deep view; this is the day-of, at-the-pool quick-action surface.

### 1. Two accurate status pills per swimmer (replaces single "Paid"/"Unpaid")

For each enrolled swimmer in the group block:

```text
[Reg fee: Paid ✓]  [Session: Due day 1]
```

- **Reg fee pill** — only shown for `is_first_time` enrollments. Green "Paid" / yellow "Unpaid" / gray "Comp" / gray "Waived" from `payment_status`.
- **Session pill** — always shown. Green "Paid" / yellow "Due day 1" / blue "Sent" (if `payment_reminder_sent_at` and still unpaid) / gray "Comp" from `session_fee_status` and `payment_reminder_sent_at`.
- **Waiver pill** — small icon-only pill: green check if `waiver_signed_at`, red triangle otherwise. Replaces the standalone "No waiver / emergency contact" line copy (we still keep the Complete Waivers button below).

### 2. New action row per swimmer (replaces single "Send Payment Link")

A compact button row under each swimmer card. Each button only appears when it actually applies:

```text
[Email reg link]  [Email session link]  [Email waiver]  [Mark paid…]  [Charge card now]
```

- **Email reg link** — first-timers only, reg fee not yet paid. Calls existing `send-registration-fee-payment-link`.
- **Email session link** — session fee due. Calls existing `send-session-payment-link`.
- **Email waiver** — waiver not signed. NEW edge function `send-enrollment-waiver-link` that emails a plain link to `/enrollment-waiver/{waiver_token}` (no payment, no reg-fee email). Uses a new minimal transactional template `enrollment-waiver-link`.
- **Complete Waivers (on this device)** — keep the existing button when waiver is unsigned; opens the front-desk waiver dialog.
- **Mark paid…** — opens a small dialog letting admin pick which fee (Reg / Session), method (cash / check / comp), and reference. Writes to `swim_enrollments` directly (same logic the swimmer-drawer Payments tab already uses, copy-pasted into a small shared hook). Requires reference for cash/check.
- **Charge card now** — opens the existing `PhoneCheckoutPanel` in a dialog using `create-admin-phone-checkout`. Admin picks Reg or Session fee from a dropdown at the top of the dialog (defaults to whichever is owed; if both, defaults to Session). The webhook (`metadata.type='admin_phone_checkout'`) already flips the right row to paid — no backend change needed beyond passing the correct `amountCents` and a `feeType` flag we add to the metadata so the webhook flips `session_fee_status` vs `payment_status` correctly.

### 3. Backend changes

1. **New edge function** `supabase/functions/send-enrollment-waiver-link/index.ts` — looks up enrollment by id, ensures `waiver_token`, emails the parent a single-purpose waiver link. ~40 lines, mirrors `send-registration-fee-payment-link` shape but with no Stripe call.
2. **New transactional template** `enrollment-waiver-link.tsx` registered in `transactional-email-templates/registry.ts`.
3. **`create-admin-phone-checkout`** — accept `feeType: 'registration' | 'session'` (default `'session'`) and stamp it on `metadata`.
4. **`payments-webhook`** `admin_phone_checkout` branch — read `metadata.feeType` and update either `payment_status` (registration) or `session_fee_status` + `session_fee_paid_at` + `session_fee_stripe_id` (session). Today it only flips one of them; this is the only behavior change to the webhook.

### 4. Out of scope

- Private/semi-private lesson occurrence block (already has its own paid/unpaid badge + mark-paid dialog and a send-payment-link button — it's correct).
- Payments tab in the swimmer drawer.
- Compliance tab and `admin-mark-waiver-complete`.

### Verification

- Open a first-time swimmer's group block: reg pill says "Paid", session pill says "Due day 1". Bug reproduced and now fixed.
- "Email waiver" sends a clean email with only the waiver link.
- "Charge card now" → pick Session → key test card `4242…` → webhook flips `session_fee_status='paid'` and pill turns green on refresh.
- "Mark paid → Session → cash" with reference "rcpt-123" writes `session_fee_status='paid'`, `payment_method='cash'`, `payment_reference='rcpt-123'`.

Approve and I'll build it.
