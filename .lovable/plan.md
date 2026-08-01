## Status: 5.2 and 5.3 were not run

Plainly stated: **the completion path is unproven end to end.** What landed was 5.1 only — concurrent `claim_pending_membership` calls and concurrent subscription-id writes at the SQL level. There was no pre-flip gate report, no environment flip, no sandbox checkout, no parallel `confirm-membership-checkout` invocation, and no flip-back read-back. 5.1 proves the two SQL functions behave; it does not prove `completeMembershipFromSetupSessionId` calls them correctly on the real path.

## Step 5.0 — Confirm the current value and the gate

1. **You read `PAYMENTS_ENV` from the dashboard and tell me the value.** No probe function is deployed. The secrets tool lists names only, so I cannot read it myself.
   - Only if the dashboard masks it and you say so: deploy a minimal `admin-env-probe` that returns `{ payments_env }` and nothing else. Its deletion is then verified in 5.3 by listing deployed functions and confirming the name is absent.
2. Re-confirm and report that the public Join button is OFF and `/join` cannot start a real enrollment, by reading `src/pages/JoinMembership.tsx` and the flag that gates it. Reported before any flip.
3. Record the pre-flip value verbatim so the flip-back target is the observed value, not an assumption. If it is anything other than `live` or `sandbox`, that is raised as an incident and no test proceeds.

## Step 5.2 — End-to-end concurrent completion in sandbox

1. Flip `PAYMENTS_ENV` to `sandbox`.
2. **Create a new, inactive standing slot dedicated to this test** — not one of the 94 production slots. Report its id on creation. It is deleted in cleanup and its deletion confirmed by re-query.
3. Insert a synthetic `pending_memberships` row against that test slot, with a clearly marked test parent email.
4. Create a sandbox setup-mode Checkout Session against that pending row, drive it in a headless browser, and complete it with `4242 4242 4242 4242`.
5. Invoke `confirm-membership-checkout` **twice in parallel** on that one session id.
6. Report each of the following as an observed count, not an expectation:
   - `memberships` rows for that session id — must be exactly 1
   - subscriptions on that Stripe customer — must be exactly 1
   - `membership_occurrences` for that membership — must be exactly 8
   - welcome sends logged — must be exactly 1
   - the loser's HTTP status and body — either the identical success payload or a clean `202 { pending: true }`, never a 500
7. Clean up: cancel the test subscription, delete the test customer, membership, occurrences, pending row, **and the test standing slot**. Report each deletion as verified.

If any part of 5.2 cannot execute (sandbox Stripe key missing, headless checkout blocked), that is reported as "the completion path is unproven end to end" with the specific blocker named. 5.1 is not offered as a substitute.

## Step 5.3 — Blocking flip-back

1. Set `PAYMENTS_ENV` back to `live`.
2. Verify the read-back shows exactly `live`. If the probe was never deployed, verification is by you reading the dashboard again and confirming; I report that the set operation completed and wait for your confirmation before declaring Phase 3 done.
3. If the probe was deployed under 5.0, delete it and confirm its absence from the deployed function list.
4. Until `live` is confirmed: Phase 3 is not complete, the Join button stays off, and no Phase 4 work starts. A mismatch is raised as an incident, not retried silently.

## Not in scope

Phase 4 capacity work, environment lockdown, and parent emails all stay untouched.

## Technical notes

No new permanent files. Test scripting runs under `/tmp/browser/`. No changes to `membership-completion.ts`, `confirm-membership-checkout`, `payments-webhook`, or `JoinMembership.tsx` — 5.2 tests the code as it stands, and any fix it surfaces is reported before being made.
