# Add "Add to Calendar" Buttons to Group Class Enrollment Confirmation Email

Extend the calendar feature to the 8-week group class enrollment confirmation email. Parents will be able to add **all lessons in the session at once** with a single tap, plus an option to add individual lessons.

## What the Parent Will See

After successful enrollment, the confirmation email will get a new "Add to Calendar" section right after the Lesson Dates list. It contains:

1. **📅 Add All Lessons to Calendar** (primary button) — downloads a single `.ics` file containing all 8 (or however many) lesson occurrences. iPhone Mail, Outlook, and Android Gmail open this natively and add every lesson in one action.
2. **Add to Google Calendar (All Lessons)** (secondary button) — opens Google Calendar with all 8 events queued. (Google Calendar's render URL only supports one event at a time, so this falls back to opening just the first lesson with a note that the .ics file is the recommended path for adding all of them. We'll keep the wording honest.)

No other formatting, layout, colors, or content of the email will change.

## Implementation

### 1. Extend the `lesson-calendar-ics` edge function to support multiple events

Currently it accepts `date`, `start`, `end` and emits one `VEVENT`. Add a new param style:

- `dates=YYYY-MM-DD,YYYY-MM-DD,...` (comma-separated list)
- When `dates` is present (multi-event mode), it ignores `date` and emits one `VEVENT` per date, all sharing the same `start`/`end`/`title`/`location`. Each event gets a unique UID derived from `uid` + the date (e.g. `enroll-<id>-2025-06-09@aquaticdreamsswim.com`) so re-imports update the right event without duplicates.
- Single-event mode (existing behavior using `date`) stays untouched — the lesson booking emails keep working unchanged.

Filename for multi-event downloads: `aquatic-dreams-session.ics`.

### 2. Add a multi-event helper to `_shared/calendar-links.ts`

New helper `buildSessionCalendarLinks({ uid, title, dates: string[], start, end, location, description })` that returns:
- `icsUrl` — points at the edge function with `dates=` param
- `googleUrl` — Google Calendar render URL pre-filled with the **first** lesson (since Google only takes one event per render call). The button label in the email will be worded so the user understands the .ics is the way to add them all.

The existing `buildCalendarLinks` (single event) stays as-is for the lesson emails.

### 3. Update `enrollment-confirmation.tsx` template

Add two optional props: `icsLink?: string`, `googleCalendarLink?: string`.

Right after the existing "Lesson Dates" infoBox, render a new `Section` with:
- A small caption: "Add all lessons to your calendar"
- Primary button "📅 Add All Lessons to Calendar" → `icsLink`
- Secondary button "Add to Google Calendar" → `googleCalendarLink`

Reuse the same `calBtnPrimary` / `calBtnSecondary` styles already added to the lesson templates so it matches visually. No other styles, sections, or footer text change.

Buttons render only when the props are present (so previews and any legacy callers still work).

### 4. Update `payments-webhook/index.ts` `sendEnrollmentConfirmation`

After fetching `lessonDates`, build calendar links:

```text
uid = `enroll-${enrollmentId}`
title = `${childName}'s Swim Lesson — ${groupName} (${levelLabel}) — Aquatic Dreams`
dates = lessonDates.map(d => d.lesson_date)
start = session.start_time
end   = session.end_time
location = '1212 Kansas Ave, Modesto, CA 95351'
description = `Instructor will be confirmed on day 1. Questions: info@aquaticdreamsswim.com / (209) 577-3483`
```

Pass `icsLink` and `googleCalendarLink` into `templateData`. Skip if there are no lesson dates or no session times (defensive — buttons just won't render).

## Files

**Edited**
- `supabase/functions/lesson-calendar-ics/index.ts` — add multi-date support
- `supabase/functions/_shared/calendar-links.ts` — add `buildSessionCalendarLinks`
- `supabase/functions/_shared/transactional-email-templates/enrollment-confirmation.tsx` — add buttons
- `supabase/functions/payments-webhook/index.ts` — generate + pass links

**Deploy**
- `lesson-calendar-ics`, `send-transactional-email`, `payments-webhook`

## Notes / Honest Caveats

- **iOS / Apple Calendar / Outlook / Android native**: One tap adds all 8 lessons. This is the best experience and the path most parents will use from the email.
- **Google Calendar**: The "render" URL only supports a single event, so the Google button will pre-fill the **first** lesson. Parents who use Google Calendar can either tap the .ics button (Google Calendar on Android opens .ics fine) or add the remaining lessons manually. We'll word the secondary button as "Add to Google Calendar" with a small caption clarifying that the .ics adds all of them.
- **No other email changes** per your earlier instruction — only the new section is added.
- **UIDs are stable per (enrollment, date)** so if a parent re-imports after a date change, calendars update the existing event instead of duplicating.
