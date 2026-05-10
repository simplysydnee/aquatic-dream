## Internal staff alerts for new lesson requests & job applications

Send a notification email to **generalmail@aquaticdreams.com** and **sutton@aquaticdreams.com** every time a parent submits a lesson request or an applicant submits a job application. Each email contains a brief summary plus a button that deep-links into the corresponding admin page.

### New email templates (React Email, in `supabase/functions/_shared/transactional-email-templates/`)

1. **`internal-lesson-request-alert.tsx`**
   - Subject: `New lesson request — {childName} (age {childAge})`
   - Body: child name + age, parent name/email/phone, lesson type (Private / Semi-Private), preferred times, truncated notes (first ~300 chars), submitted timestamp.
   - CTA button "Open in Admin" → `https://aquaticdreamsswim.com/admin/lesson-requests` (uses production custom domain).

2. **`internal-job-application-alert.tsx`**
   - Subject: `New job application — {applicantName} for {jobTitle}`
   - Body: applicant name, email, phone, position applied for, short snippet of cover letter / availability if present, submitted timestamp.
   - CTA button "Open in Admin" → `https://aquaticdreamsswim.com/admin/applications`.

Both registered in `registry.ts`. Brand-styled (Teal `#2a5e84` heading + Coral `#F58B76` button) consistent with existing transactional emails. White body background.

### Trigger wiring (client-side, fire-and-forget after row insert)

- **`src/components/swim-enrollment/LessonRequestForm.tsx`**: after the existing parent acknowledgment invoke, add two more `supabase.functions.invoke("send-transactional-email", …)` calls — one per recipient — using `templateName: "internal-lesson-request-alert"` and idempotency keys `lesson-req-internal-general-${id}` and `lesson-req-internal-sutton-${id}`.

- **`src/components/careers/JobApplicationForm.tsx`**: after the insert, add the same pair of invocations with `templateName: "internal-job-application-alert"` and idempotency keys `job-app-internal-general-${id}` / `job-app-internal-sutton-${id}`.

Recipients are hardcoded constants (`STAFF_ALERT_EMAILS = ["generalmail@aquaticdreams.com", "sutton@aquaticdreams.com"]`) at the top of each form. One invoke per recipient (the send function is one-recipient-per-call by design). Failures are logged to console only — they never block the user-facing success state.

### Out of scope
- No new DB tables, no settings UI to edit recipients (hardcoded per request).
- No SMS, no Slack, no in-app notifications.
- No changes to existing parent acknowledgment emails or admin badge counts.
- Contact form / other inbound channels — only lesson requests and job applications as requested.

### Deployment
- Deploy `send-transactional-email` after registry update so the two new templates are recognized.

### Files touched
- **New**: `supabase/functions/_shared/transactional-email-templates/internal-lesson-request-alert.tsx`, `internal-job-application-alert.tsx`
- **Edited**: `supabase/functions/_shared/transactional-email-templates/registry.ts`, `src/components/swim-enrollment/LessonRequestForm.tsx`, `src/components/careers/JobApplicationForm.tsx`
