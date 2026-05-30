## Plan

1. **Fix the visitor waiver submission path**
   - Stop the `/waivers` public form from depending on direct browser access to `visitor_waivers` returning rows after insert, because that table intentionally has no public read access for private waiver data.
   - Add a small backend function for public visitor waiver submissions that uses server-side credentials to save the waiver, send the emailed copy, and mark the email timestamp without exposing waiver records publicly.
   - Keep admin-only viewing/editing rules intact so visitor PII is still protected.

2. **Update the frontend submission helper**
   - Change the public/kiosk waiver form to call the new backend submission function.
   - Preserve the existing success message: “A copy has been emailed to you.”
   - Show a clearer error if the backend submission fails.

3. **Make birthdate day selection easier**
   - Replace the single browser-native `type="date"` control in `SwimmersCoveredFields` with three explicit fields: Month, Day, Year.
   - Store the final value in the same `YYYY-MM-DD` format already used by the waiver payload, so existing database/email behavior remains compatible.
   - Keep it mobile-friendly with compact dropdown/input controls and validation-safe formatting.

## Technical details

- The current `visitor_waivers` table has public create access but not public read access, which is good for privacy. The current client insert asks the database to return `id`, which can conflict with the no-public-read policy.
- The backend function avoids widening public read permissions and is the safest way to “bypass” the visitor RLS problem for `/waivers` submissions only.
- No public SELECT policy will be added to `visitor_waivers`.