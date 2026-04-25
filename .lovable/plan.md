# Lesson Requests — surface auto-ack in the admin dialog

## Decision
Keep the auto-acknowledgment email as-is (already correct: it does NOT flip status). Add UI so admins can clearly see the auto-ack was sent and understand the difference between auto-ack and a real personal reply.

## Changes

### 1. `src/components/admin/LessonRequestDetailDialog.tsx`
- Add an "✓ Auto-confirmation sent at submission" info line (green, small, with `MailCheck` icon) directly under the Submitted timestamp. Shown for every request since the auto-ack always fires on submit.
- Update the helper text under the manual reply textarea from:
  > "Sends from your branded email. Status will be set to 'Contacted' automatically."
  
  to:
  > "This is your first **personal** reply (separate from the auto-confirmation the parent already received). Sending will move status from 'New' to 'Contacted'."

### 2. `src/pages/admin/LessonRequestsAdmin.tsx`
- Add a tooltip on `new`-status badges: *"Auto-confirmation sent. Awaiting personal reply."* — so when scanning the table, admins know `new` doesn't mean the parent has heard nothing.

## Out of scope
- No DB schema changes
- No tracking of auto-ack send success/failure (assumes success, matching today's behavior)
- No changes to the email templates
