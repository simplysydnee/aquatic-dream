## Auto-acknowledgment for lesson requests

Send an automatic confirmation email the moment someone submits the private/semi-private lesson request form, so they immediately know we received it and someone will follow up.

### What the email says

Branded email matching the existing `lesson-request-reply.tsx` styling:
- Subject: "We got your lesson request — Aquatic Dreams"
- Greets the parent by first name
- Confirms we received the request for `{childName}` (`{lessonType}` lesson)
- Sets expectation: "Someone from our team will reach out within 1–2 business days to schedule"
- Includes contact info (phone + email) in case they need to reach us sooner
- Standard footer

### Changes

**1. New template** — `supabase/functions/_shared/transactional-email-templates/lesson-request-acknowledgment.tsx`
- React Email component, same visual style as `lesson-request-reply.tsx`
- Props: `parentName`, `childName`, `lessonType`
- Exports `template` with `previewData` for the dashboard preview

**2. Register it** — add the import + entry to `supabase/functions/_shared/transactional-email-templates/registry.ts` under key `lesson-request-acknowledgment`.

**3. Trigger it** — in `src/components/swim-enrollment/LessonRequestForm.tsx`, after the successful `lesson_requests` insert:
- Capture an `id` (use `crypto.randomUUID()` and pass it in the insert) so we have an idempotency key
- Call `supabase.functions.invoke('send-transactional-email', { body: { templateName: 'lesson-request-acknowledgment', recipientEmail: parsed.data.parentEmail, idempotencyKey: \`lesson-req-ack-${id}\`, templateData: { parentName, childName, lessonType } } })`
- Fire-and-forget (don't block the success state on it; log errors to console only)

**4. Deploy** — redeploy `send-transactional-email` so the new template is picked up by the running function.

### Safety

- Does NOT touch the admin reply flow, the existing `lesson-request-reply` template, or any checkout/payment code
- Email goes through the existing queued infrastructure (retry-safe, suppression-aware)
- If the email send fails, the form still succeeds — user still sees the confirmation screen
