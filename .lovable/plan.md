## Fix private lesson booking email + add parent info

### Why the email didn't trigger

Looking at `supabase/functions/confirm-private-booking/index.ts`, the call to `send-transactional-email` is **fire-and-forget** (`.catch(...)` with no `await`). When the handler returns its JSON response, the Edge Function isolate shuts down before the queued invoke actually fires. Edge logs confirm the function booted at 21:04 and shut down immediately at 21:07:36, and `email_send_log` has zero rows for the 21:02 booking by Sydnee.

**Fix**: `await` the `supabase.functions.invoke('send-transactional-email', ...)` call (wrapped in try/catch so a send failure still returns success to the client). The booking is already marked active before the await, so the user experience is unchanged.

### Add Parent Information section to the template

Update `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx` to append a "Parent Information" section near the bottom (before the closing "Questions?" line) with:

- All swimmers who might have an accident in the pool MUST wear a swim diaper.
- Please have all swimmers use the restroom before lessons start.
- Please do not have your child eat 30 minutes prior to swim lessons.
- Please only bring required family with you to the pool — pool deck space is limited.
- Children not in the pool with an instructor may NOT touch the water at any time.

Styled as a bordered info section consistent with existing `policyBox` / `infoBox` styling. This shows on every booking confirmation (public flow + admin-sent), so no changes needed at the call sites.

### Files

- `supabase/functions/confirm-private-booking/index.ts` — await the email invoke
- `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx` — add Parent Information section
- Redeploy both edge functions after edits