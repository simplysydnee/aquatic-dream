

## Fix: Enrollment Confirmation Email Not Sending

### Root Cause

The `payments-webhook` edge function calls `send-transactional-email` after a successful Stripe payment. The call returned **401 Unauthorized** because `send-transactional-email` has `verify_jwt = true` in `config.toml`, and the server-to-server invocation from the webhook isn't passing the JWT in the format the gateway expects.

The edge function logs confirm:
- Webhook received and processed correctly (enrollment marked as paid ✅)
- `send-transactional-email` was called but returned 401 ❌
- Email was never enqueued, so no confirmation was sent

### Fix

**One change in `supabase/config.toml`**: Set `verify_jwt = false` for `send-transactional-email`. This is safe because the function is already protected — it requires a valid request body with a registered template name, and it uses the service role client internally. The JWT gate is redundant and blocks legitimate server-to-server calls.

After updating config.toml, redeploy `send-transactional-email` so the new config takes effect.

### Files Modified
- `supabase/config.toml` — change `verify_jwt` from `true` to `false` for `send-transactional-email`

