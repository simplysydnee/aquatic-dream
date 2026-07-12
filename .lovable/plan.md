## Root cause

The dialog is fine — the deployed edge function is stale. Network trace shows the response body has no `rows`, no `mode` field, and includes `sent`/`failed`/`errors`:

```
{"ok":true,"targetDate":"2026-07-13","total":56,"sent":0,"failed":0,
 "withPayLink":0,"reminderOnly":0,"skippedNoPhone":7,"skippedAlreadySent":49,"errors":[]}
```

That's the pre-preview version of `send-session-start-reminders`. The recent edits to add `mode: "preview"` and return `rows` never actually redeployed to Supabase — the client is still hitting the old code, which explains why counts render but `rows` is absent.

Because the old function goes straight into the (real) send loop, this is also unsafe: the only reason nothing texted this time is that all 56 rows happened to be "already sent" or "no phone". A future preview click could send real SMS.

## Fix

Force a redeploy of the edge function and confirm the new response shape.

1. Redeploy `send-session-start-reminders` with the current source in the repo (no code changes needed — the file already has the preview branch and parallel pay-link fetch from the previous turn).
2. Re-open the preview dialog and verify the network response now includes `mode: "preview"` and a `rows` array of length 56. Confirm no SMS are sent (check `reminder_logs` has no new inserts from this preview call).

If the redeploy still returns the old shape, inspect for a deploy error (syntax issue, import failure) in the function logs and patch minimally, then redeploy again.

## Out of scope

- No changes to the dialog UI, Stripe link generation, `reminder_logs`, or any other reminder flow.
- No schema changes.

## Files touched

- None expected. Only a redeploy of `supabase/functions/send-session-start-reminders/index.ts`. If the redeploy surfaces a build error, the fix will be scoped to that file only.
