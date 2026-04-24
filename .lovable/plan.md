## Plan: Lesson Request Detail + Reply + Admin "New" Badges

Three problems to fix on `/admin/lesson-requests` and the admin sidebar:
1. Rows aren't clickable — no way to open a request and see full details (notes, full message, etc.)
2. No way to reply to a parent via email from the admin
3. No visual indicator in the sidebar showing pending items needing attention

### 1. Lesson Request Detail Dialog

Make each table row clickable to open a detail dialog showing:
- Child name, age, lesson type
- Parent name, email (clickable mailto), phone (clickable tel)
- Preferred times (full text, not truncated)
- Notes (full text)
- Submission date
- Status dropdown (same options as today)

### 2. Reply via Email

Inside the detail dialog, add a **"Reply via Email"** section with:
- A subject field (pre-filled: `Re: Your lesson request for {childName}`)
- A message textarea (pre-filled with a friendly default template the admin can edit)
- A **"Send Reply"** button

When clicked:
- Sends a transactional email through the existing Lovable Cloud email system to the parent's email address
- Auto-updates the request status from `new` → `contacted`
- Shows a success toast
- Logs the reply timestamp on the request (new column `last_replied_at`)

This uses the existing `send-transactional-email` infrastructure — no new email provider, no extra setup needed.

### 3. New "Lesson Reply" Email Template

Create a new transactional email template `lesson-request-reply` with:
- Aquatic Dreams branded header (matching enrollment-confirmation styling)
- Greeting using parent's first name
- The admin's custom message body (preserves line breaks)
- Sign-off from the Aquatic Dreams team
- Contact info footer (phone, email)

### 4. Admin Sidebar Notification Badges

Add red count badges next to sidebar items that have pending/new records:
- **Lesson Requests** — count of `status = 'new'`
- **Contact Inquiries** — count of `status = 'new'`
- **Applications** — count where `is_viewed = false`
- **Swim Enrollments** — (skipping — no clear "new" signal currently)

Badges:
- Small red circle with white number
- Only shown when count > 0
- Hidden when sidebar is collapsed (or shown as a small dot)
- Refresh on mount + every 60 seconds (lightweight polling)

### Technical Details

**Files to add:**
- `src/components/admin/LessonRequestDetailDialog.tsx` — the detail/reply modal
- `supabase/functions/_shared/transactional-email-templates/lesson-request-reply.tsx` — branded reply template
- `src/hooks/useAdminBadgeCounts.ts` — hook returning `{ newLessonRequests, newContacts, newApplications }`

**Files to edit:**
- `src/pages/admin/LessonRequestsAdmin.tsx` — make rows clickable, wire dialog, refetch on update
- `src/components/admin/AdminSidebar.tsx` — render badges next to items
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template

**Database migration:**
- `ALTER TABLE lesson_requests ADD COLUMN last_replied_at timestamptz` — to track when we replied
- `ALTER TABLE lesson_requests ADD COLUMN last_reply_message text` — to keep a record of what was sent

**Send reply flow:**
```
Admin clicks Send Reply
  → supabase.functions.invoke('send-transactional-email', {
      templateName: 'lesson-request-reply',
      recipientEmail: request.parent_email,
      idempotencyKey: `lesson-reply-${request.id}-${Date.now()}`,
      templateData: { parentName, childName, subject, body, replyToEmail: 'info@aquaticdreamsswim.com' }
    })
  → update lesson_requests set status='contacted', last_replied_at=now(), last_reply_message=body
  → toast success
  → close dialog and refetch
```

### Not doing
- No threaded back-and-forth conversation (one-way reply only — parent's response goes to your inbox, not back into the admin)
- No bulk reply
- No template library for canned responses (can add later if useful)
- No notification badges on **Swim Enrollments** (would need to define what "new/needs attention" means there — happy to add if you tell me the criteria)

### After approval
Apply migration, deploy the new email function, send a test reply to sydnee@icanswim209.com so you can see the email format, and confirm the badge counts render.

**Approve to proceed?**