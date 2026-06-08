## Goal
Make the enrollment flow compliant with TextMagic / carrier (10DLC) SMS rules so the form qualifies as a valid opt-in source. This requires an explicit, unchecked SMS consent checkbox with the required disclosure language, plus a public SMS Terms page and a Privacy Policy reference to SMS data handling.

## What TextMagic requires on the opt-in form
1. A clearly labeled checkbox the user must actively check (not pre-checked, not bundled with TOS).
2. Disclosure text immediately next to it that includes:
   - Business name (Aquatic Dreams Swim Modesto)
   - Message purpose (lesson reminders, schedule changes, account/booking info)
   - "Message and data rates may apply"
   - "Message frequency varies"
   - "Reply STOP to unsubscribe, HELP for help"
   - Links to Privacy Policy and SMS Terms
3. The phone number field must be on the same form as the consent.
4. Opt-in must be logged with timestamp, IP, and the exact disclosure text version shown.
5. A public SMS Terms page reachable from the form and footer.

## Changes

### 1. Enrollment form — `src/components/swim-enrollment/EnrollmentForm.tsx`
The parent phone field is already here. Right under the phone field add:
- A required, unchecked checkbox: `smsConsent`
- Label/disclosure (visible, not collapsed):
  > "I agree to receive SMS text messages from Aquatic Dreams Swim Modesto about my swimmer's lessons, schedule changes, reminders, and account updates at the phone number above. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. See our [SMS Terms](/sms-terms) and [Privacy Policy](/privacy-policy)."
- A short helper line: "Optional — uncheck if you do not want lesson reminder texts." (only if we want it optional; per TextMagic it can be optional but must be unchecked by default either way).

Decision needed (see questions): required vs optional. Recommended = **optional but unchecked by default** so a parent who declines can still enroll, and we only text those who opted in.

Add `smsConsent: boolean` to `EnrollmentFormData`.

### 2. Legal step — `src/components/swim-enrollment/LegalAgreements.tsx`
No change to consent capture itself (kept on the info step where phone lives, per TextMagic rule). The signature block in LegalAgreements already records IP + timestamp + signer; we'll extend the payload to also carry `smsConsent`, `smsConsentText` (the exact disclosure shown), and `smsConsentVersion`.

### 3. Disclosure versioning — `src/components/swim-enrollment/legal-content.ts`
Add `SMS_CONSENT_VERSION = "v1-2026-06-08"` and export `SMS_CONSENT_DISCLOSURE` (the exact string above) so we can prove what each parent agreed to.

### 4. Persist consent
- DB migration: add columns to `swim_enrollments`
  - `sms_consent boolean not null default false`
  - `sms_consent_at timestamptz`
  - `sms_consent_ip text`
  - `sms_consent_version text`
  - `sms_consent_text text`
- Mirror columns on `lesson_requests` and the private-booking enrollment path so all enrollment entry points capture consent.
- Edge function `create-pending-enrollment` (and `admin-create-enrollment`, `confirm-private-booking`, `submit-waitlist-request`, `LessonRequestForm` insert) write the consent fields when present.

### 5. New public page — `src/pages/SmsTerms.tsx` at route `/sms-terms`
Content covers: program name, message types, frequency, MSG&DATA disclaimer, STOP/HELP instructions, supported carriers disclaimer, how to opt out, contact email/phone, link to privacy policy. Add SEO tags and a link from the footer.

### 6. Privacy Policy update
Add a "SMS / text messaging" section to existing privacy content (in `legal-content.ts`) noting:
- Phone numbers collected for service communication
- Never shared with third parties for marketing
- Carrier (TextMagic) is the processor
- How to opt out

### 7. Footer link
Add "SMS Terms" link in `src/components/Footer.tsx` next to Privacy / Terms.

### 8. Send-side enforcement
Update the planned `send-lesson-reminders-sms` edge function (and any other SMS sender) to skip rows where `sms_consent != true` and log skipped recipients so staff can call/email them instead.

### 9. Admin visibility
On the enrollment detail dialog, show an "SMS: Opted in (date/IP)" or "SMS: Not opted in" badge so staff can see at a glance.

## Files touched
- `src/components/swim-enrollment/EnrollmentForm.tsx` (UI + schema)
- `src/components/swim-enrollment/LegalAgreements.tsx` (carry through to signature record)
- `src/components/swim-enrollment/legal-content.ts` (disclosure constant + version)
- `src/pages/SwimEnrollment.tsx` (pass consent into checkout payload)
- `src/components/swim-enrollment/EnrollmentCheckout.tsx` (include in buildPayload)
- `supabase/functions/create-pending-enrollment/index.ts` (persist)
- `supabase/functions/admin-create-enrollment/index.ts` (persist + admin override)
- `supabase/functions/confirm-private-booking/index.ts` (persist)
- `src/components/swim-enrollment/LessonRequestForm.tsx` + table
- New `src/pages/SmsTerms.tsx` + route in `src/App.tsx`
- `src/components/Footer.tsx`
- `src/components/admin/EnrollmentDetailDialog.tsx` (badge)
- New migration adding consent columns
- Privacy policy content update

## Opt-in screenshot for TextMagic
Once shipped, take a screenshot of the Details step showing the SMS checkbox + disclosure and upload it to the TextMagic "Opt-in screenshot" field. Use `https://aquaticdreamsswim.com/privacy-policy` and `https://aquaticdreamsswim.com/sms-terms` in the two URL fields.

## Open questions
1. Make SMS consent **required** to complete enrollment, or **optional** (unchecked default)? Recommended: optional.
2. Should we also collect SMS consent on the private-lesson booking flow and the waitlist form, or only the group enrollment form?
3. Existing parents already in the DB — do you want a one-time email asking them to opt in to texts (so we can text current students legally), or only collect going forward?
