# Separate SMS send from hold creation

## First: how sendAndLogBookingConfirmation dedupes

It does not dedupe at all. `_shared/textmagic.ts` normalizes the phone, calls TextMagic once, and writes a `reminder_logs` row (`channel: sms`, status sent/failed). There is no lookup of prior sends, no idempotency key, no unique constraint. The only "already sent" signal today is `membership_holds.sms_sent_at`, which `create-membership-hold` stamps after a successful send. So any repeat-send protection has to live in the calling function.

Also confirmed: the message text hardcodes "within 48 hrs" even when `hold_hours` is something else, and `hold_hours` is already parsed with `Number()` so fractions pass validation but the message and expiry copy do not reflect them.

## 1. create-membership-hold changes

- New optional body field `send_sms` (boolean, default true). When false: create the hold, skip the TextMagic call and the `sms_sent_at` stamp entirely, and return `sms_sent: false` with `sms_skipped: true` plus the link so the admin UI can copy it.
- Replace the hardcoded "within 48 hrs" with a duration phrase derived from the actual hold window: under 1 hour renders as minutes ("within 20 min"), 1 hour renders "within 1 hr", otherwise "within N hrs" (halves rendered as "1.5 hrs").
- Fractional hours: keep the existing `hold_hours` field and accept fractions, with a floor of 0.25 (15 min) and the existing 168 cap. A 20 minute draft is `hold_hours: 0.334`, which is awkward, so also accept an optional `hold_minutes` integer (5 to 10080) that wins when present. Choice reported: both, with `hold_minutes` preferred for short drafts.
- Nothing else changes: capacity check, level gate, admin auth, insert shape stay as-is. Short holds expire on the existing sweep because it only reads `held_until`.

## 2. New function: send-membership-hold-invites

`supabase/functions/send-membership-hold-invites/index.ts`, admin-gated with the same `has_role` check used by `create-membership-hold`.

Input: `{ hold_ids: string[] }` (1 to 10 ids).

Flow:
1. Load the holds with their standing slot (plan_key, day_of_week, start_time).
2. Reject the batch if any hold is missing, any status is not `held`, or the normalized `parent_phone` values differ across holds. Mixed batch returns 400 with the reason.
3. Partition: holds with `sms_sent_at` already set are skipped and reported, never re-sent. If every hold is already sent, return success with an empty send and the skipped list.
4. Extend `held_until` to now + 48 hours on the sendable holds.
5. Compose one message listing each swimmer with program, day, and time, plus a single link. Single-hold batches read the same as today's one-swimmer copy. Multi-swimmer example:

```text
Aquatic Dreams: we're holding spots for Mia (Small Group Swim, Tue 4:15 PM) and Leo (Private Swim, Tue 5:00 PM). Finish enrollment within 48 hrs: https://aquaticdreamsswim.com/join?hold=<token>
```

The link uses the first sendable hold's token. Holds after the first are still stamped and extended, so the parent completes them one at a time from the same phone.
6. Send once via `sendAndLogBookingConfirmation`. On success stamp `sms_sent_at` on every hold in the batch; on failure stamp nothing so a retry is possible.
7. Response: `{ success, sent, message, results: [{ hold_id, status: 'sent' | 'skipped_already_sent', held_until }], skipped: [...] }`.

## Technical notes

- No schema migration needed. `sms_sent_at` and `held_until` already exist on `membership_holds`.
- No changes to capacity logic, the level gate, admin auth, or the sweep job.
- Both functions deploy after the edits; `send-membership-hold-invites` validates JWT in code like its sibling.
- No frontend changes in this phase. `CreateMembershipHoldDialog` keeps its current behavior because `send_sms` defaults to true.

## Verification

1. Existing single-hold creation with no new fields texts exactly as before (same wording for the 48h default).
2. `send_sms: false` creates the hold, writes no `reminder_logs` row, leaves `sms_sent_at` null.
3. A `hold_minutes: 20` hold gets `held_until` 20 minutes out and is picked up by the normal sweep.
4. Batch send over two holds on one phone extends both to 48h, sends one message, stamps both.
5. Re-running the same batch sends nothing and returns both as `skipped_already_sent`.
