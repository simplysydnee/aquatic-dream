## Problem

In the enrollment SMS opt-in box (`src/components/swim-enrollment/EnrollmentForm.tsx`, lines 200–203), the "SMS Terms" and "Privacy Policy" links exist but:

- "Privacy Policy" points to `/waivers` (wrong — opens the waivers page, not the privacy policy)
- "SMS Terms" correctly points to `/sms-terms`
- Both already use `target="_blank"` so they open in a new tab

## Fix (single line change)

In `src/components/swim-enrollment/EnrollmentForm.tsx` line 203, change the Privacy Policy `<Link>` `to="/waivers"` → `to="/privacy-policy"`.

That's it — the dedicated `/privacy-policy` page already exists (`src/pages/PrivacyPolicy.tsx`) and is routed in `App.tsx`. After this change, clicking either link in the SMS consent box opens the correct policy in a new tab.

## Out of scope

No changes to copy, styling, the consent disclosure string in `legal-content.ts`, or anywhere else SMS consent is referenced.
