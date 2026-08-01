## Phase 3 — make duplicate memberships impossible

Verified before planning:
- `public.memberships` has **no** `stripe_session_id` column yet.
- 6 membership rows: 3 keepers (subscription ids set) and 3 duplicates (subscription id already nulled, incident details in `notes`).
- Each duplicate pair traces to a **single** `pending_memberships` row whose payload holds the *later* subscription id — direct evidence of the unconditional overwrite.

### Step 1 — Loser behavior (approved)

- **Wait window:** loser polls the pending row for `payload.stripe_subscription_id` every 1s for up to **25s**.
- **If the id appears:** skips subscription creation, runs the idempotent `ensureMembershipRecord`, returns the same membership id, occurrence count and amounts as the winner.
- **If not within 25s:** returns HTTP **202** `{ pending: true, reason: "in_progress" }`. Never a 500.
- **Parent on `/join`:** the return page treats `pending: true` as the finalizing state — spinner plus "Payment received. Finishing your membership…" — and re-calls `confirm-membership-checkout` every 3s for up to 2 minutes. On `success: true` it renders the normal confirmation with the manage link. After 2 minutes it shows a reassuring terminal message (payment received, membership being finalized, welcome email on its way, contact number). No error, no blank screen. Genuine failures (invalid session, declined SetupIntent) still surface as errors.

### Step 2 — Atomic claim

Migration adds `claimed_at timestamptz` and `claimed_by text` to `pending_memberships`, plus `public.claim_pending_membership(p_pending_id uuid, p_claimer text)` — a single conditional `UPDATE … WHERE id = p_pending_id AND (claimed_at IS NULL OR claimed_at < now() - interval '90 seconds')` returning the row on win, no rows on loss. One statement, no read-then-write gap.

### Step 3 — Conditional payload write + idempotency key

- **Idempotency key confirmed pure:** the literal expression is `"membership-sub-" + pendingId` and nothing else — no timestamp, no random value, no attempt counter, no claim id. A stale reclaim of a slow-but-alive winner therefore sends the identical key and Stripe returns the *same* subscription. Re-read and confirmed after implementation.
- Payload write becomes conditional: `public.set_pending_membership_subscription(p_id uuid, p_sub text)` writes only `WHERE payload->>'stripe_subscription_id' IS NULL`. On 0 rows updated, the code reads back the stored id, logs a loud warning with both ids, and reconciles onto the stored one. The unconditional overwrite is removed.

### Step 4 — Backfill, verify, then index

1. Add nullable `memberships.stripe_session_id text`.
2. Backfill all 6 rows from the audited pairing (each pair's pending row supplies the session id for both keeper and duplicate; duplicates identified by the cancelled subscription id in `notes`).
3. **Verify before any index:** report `count(*) where stripe_session_id is not null` — must be exactly **6**. If not, stop and report; no index is created, since a null slips past a partial index and silently loses protection.
4. Null the session id on the 3 duplicates, re-report the count — expected **3** non-null, all distinct.
5. Only then create both partial unique indexes, on `stripe_session_id` and `stripe_subscription_id`, each `WHERE … IS NOT NULL`, with pre-check duplicate counts reported.

### Step 5 — Prove it (sandbox flip, gated both ends)

**5.0 — Pre-flip safety gate.** Confirm and report that the Join button is OFF and `/join` cannot start a real enrollment *before* `PAYMENTS_ENV` is changed. The public join path stays closed for the entire sandbox window, so no parent can save a test card against a real slot. Current `PAYMENTS_ENV` value is read and recorded first, then flipped to `sandbox`.

**5.1 — DB-level:** two concurrent `claim_pending_membership` calls on one test pending row; exactly one returns a row. Necessary but *not* sufficient — it proves the function, not that the completion path calls it correctly.

**5.2 — End-to-end (the test that matters):** create a sandbox setup-mode checkout session, complete it with test card `4242 4242 4242 4242`, then invoke `confirm-membership-checkout` twice in parallel on the same session id. Confirm exactly 1 `memberships` row, exactly 1 subscription on that Stripe customer, one set of 8 occurrences, one welcome send, and that the loser returned either the identical result or a clean 202. Clean up the test subscription, customer, membership, occurrences and pending row.
If 5.2 cannot run cleanly, that is reported plainly as "the completion path is unproven end to end" — 5.1 is never offered as a substitute.

**5.3 — Blocking flip-back.** `PAYMENTS_ENV` is set back to `live`, then **read back and verified to equal exactly `live`**, and that verification output is reported to you. Setting it does not count as done; only the read-back does. Until that read-back shows `live`:
- Phase 3 is not reported complete,
- the Join button stays off,
- no further work proceeds.

If the read-back shows anything other than `live`, that is raised immediately as an incident rather than retried silently.

### Not in this phase
Capacity re-check and trigger (Phase 4); environment lockdown (Phase 5). Join stays off throughout. No parent emails.

### Technical notes
Touched: `supabase/functions/_shared/membership-completion.ts`, `supabase/functions/confirm-membership-checkout/index.ts`, `src/pages/JoinMembership.tsx` (return-page polling only), and two migrations. `payments-webhook` is unchanged apart from inheriting the shared completion helper.
