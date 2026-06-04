## Send welcome emails to all Session 1 parents

Invoke the existing `send-session-welcome-email` edge function with Session 1's `sessionPeriodId` (`a1111111-1111-1111-1111-111111111111`). The function already:

- Loads every confirmed/enrolled/pending enrollment in that session period
- Groups by `parent_email` (one combined email per parent, all their swimmers)
- Builds the combined `.ics` + Google Calendar links for every lesson date
- Resolves the payment link for any parent who still owes the session fee
- Uses idempotency key `session-welcome-{periodId}-{parent_email}` so re-sends are safe
- Stamps `session_welcome_sent_at` on every enrollment after a successful send

### Steps

1. **Dry run first** — call the function with `{ sessionPeriodId: "a1111111-…", dryRun: true }` to print the parent groups and swimmer counts so we can sanity-check before sending.
2. **Confirm with you** the dry-run looks right (number of parents, no surprise recipients).
3. **Live send** — call the function with `{ sessionPeriodId: "a1111111-…" }`. Returns `{ sent, total, results[] }`.
4. **Spot-check** `email_send_log` for any `failed` rows and report back.

### Out of scope

- No template changes (already fixed July 1 issue in the last turn).
- No schema changes.
- No new triggers — this is a one-shot manual send.