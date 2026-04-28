## Root cause of "Past Client" mislabel

The `session_periods` table has stale 2025 dates:

```text
Session 1: 2025-06-08 → 2025-07-02
Session 2: 2025-07-13 → 2025-08-06
```

Today is April 2026, so every enrollment in those sessions ended ~10 months ago → "Past Client." John Poses and Kaira Kang are flagged this way because their sessions look long-finished, when really they should be **upcoming 2026 sessions**.

**Fix:** bump the period dates to 2026 (and bump matching `swim_sessions.session_start_date` / `session_end_date`). I'll preview the exact rows for approval before running the update so the owner can confirm Session 1 = June 2026 and Session 2 = July 2026 before anything changes.

After the date fix, John & Kaira will correctly show as **Enrolled · Upcoming**.

---

## Everything else you asked for

### 1. Phone formatting (`555-555-5555`)
New `src/lib/phone.ts` with `formatPhone()` (handles `5555555555`, `+15555555555`, `(555) 555-5555`). Apply on:
- Clients list rows
- Swimmer detail drawer
- Lesson request detail dialog
`tel:` links keep raw digits.

### 2. Color-coded level tags (match Class Roster)
Reuse `LEVEL_BADGE_COLORS` from `src/components/swim-enrollment/types.ts` (white/red/yellow/blue/green hex codes already used on Class Roster) for the level badge on:
- Each swimmer card in the Clients list
- The swimmer detail drawer header

### 3. Internal comments — shared between Clients & Lesson Requests

**New table `internal_comments`:**
```text
id, target_type ('swimmer' | 'lesson_request'),
target_key (text), body, author_id, author_name,
created_at, updated_at
```
- Swimmer key = `lower(child_name)|lower(parent_email)` (matches existing `swimmerKey` in `useSwimmers.ts`)
- Lesson request key = `lesson_request.id`

RLS: authenticated admins only (select/insert/update/delete own).

**New `InternalCommentsPanel` component** — list of notes with author + timestamp, textarea + "Add note" button, edit/delete on own notes, realtime updates.

Mounted in:
- `SwimmerDetailDrawer.tsx` → new **Notes** tab
- `LessonRequestDetailDialog.tsx` → new **Internal Notes** section above the Reply form (so staff can document call attempts, voicemails, etc.)

Small **note-count badge** on the swimmer card and the lesson request row so staff see at a glance there are notes.

### 4. Rename "Timeline" → "Enrollments & Lessons"
In `SwimmerDetailDrawer.tsx`, change the tab label and split entries under two headings:
- **Enrollments** — session name, dates, level, payment status
- **Lessons & Requests** — booking type, date range, request status

Sorted newest first. Each entry stays clickable.

---

## Files touched

**New**
- `src/lib/phone.ts`
- `src/components/admin/InternalCommentsPanel.tsx`
- `src/hooks/useInternalComments.ts`
- Migration: create `internal_comments` table + RLS
- Data update: `session_periods` + `swim_sessions` 2025 → 2026 (preview before running)

**Edited**
- `src/pages/admin/ClientsAdmin.tsx` — phone formatting, level color, note badge
- `src/components/admin/clients/SwimmerDetailDrawer.tsx` — tab rename + split, Notes tab, phone, level color
- `src/components/admin/LessonRequestDetailDialog.tsx` — phone, internal notes section
- `src/pages/admin/LessonRequestsAdmin.tsx` — note-count badge

---

## One question before I start

For the **2025 → 2026 date fix on session_periods + swim_sessions**: should I just shift everything forward exactly **one year** (2025-06-08 → 2026-06-08, etc.), or do you want to set custom new dates for Session 1 and Session 2?
