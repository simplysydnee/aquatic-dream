# Add "Add to Calendar" to Lesson Emails

Yes — we can add a one-tap "Add to Calendar" feature that works on iPhone (Apple Calendar), Android (Google/Samsung Calendar), and Outlook directly from the email.

## How It Works

The cleanest cross-device approach uses two links in the email:

1. **Add to Calendar (Apple / Outlook / Android)** — links to a `.ics` calendar file. iPhone Mail, Outlook, and Android Gmail all natively recognize this and prompt the user to add it with one tap.
2. **Add to Google Calendar** — a `https://calendar.google.com/calendar/render?...` URL that opens Google Calendar pre-filled.

This dual-button pattern is the industry standard (used by Eventbrite, Calendly, Airbnb) because no single format covers all phones.

## Implementation Plan

### 1. New edge function: `lesson-calendar-ics`
- Public endpoint (no auth) at `/functions/v1/lesson-calendar-ics?booking=<id>` (and a variant for group enrollments).
- Looks up the booking/occurrence in `lesson_bookings` / `pool_events`.
- Returns a valid `.ics` file with:
  - `SUMMARY`: e.g. "Tommy's Private Swim Lesson — Aquatic Dreams"
  - `DTSTART` / `DTEND` in America/Los_Angeles timezone
  - `LOCATION`: facility address from the contact-info memory
  - `DESCRIPTION`: instructor name, lesson type, contact info
  - `UID`: stable per booking so updates replace (not duplicate) the event
- Headers: `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: attachment; filename="aquatic-dreams-lesson.ics"`.

### 2. Update `lesson-booking-confirmation.tsx` template
- Add new optional props: `icsLink?: string`, `googleCalendarLink?: string`.
- Add a new `Section` after the date/time info box with two side-by-side buttons:
  - **📅 Add to Calendar** (links to `icsLink` — works on iPhone/Outlook/Android)
  - **Add to Google Calendar** (links to `googleCalendarLink`)
- Style consistent with existing maritime palette (teal `#5badcb` primary, navy `#0f2343` secondary).
- No changes to any other email formatting.

### 3. Update `lesson-reminder.tsx` template
- Same two buttons added to the 24-hour reminder email so parents who didn't add it earlier get another chance.

### 4. Update senders to pass the new props
Update the three places that send these emails to compute and pass the links:
- `send-lesson-booking-confirmation/index.ts`
- `send-lesson-occurrence-reminders/index.ts`
- `send-lesson-reminders/index.ts`

The Google Calendar URL is built inline (no API call needed):
```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=<title>&dates=<start>/<end>&location=<addr>&details=<desc>
```

The `.ics` URL points at the new edge function with the booking ID.

## What I Will NOT Touch
- Email logo, layout, colors, footer, or any other formatting per your earlier instruction.
- Other email templates (enrollment confirmation, payment links, etc.) — only the two lesson emails get the calendar buttons. (Happy to add to enrollment confirmation too if you want — just say the word.)

## Files
- **New**: `supabase/functions/lesson-calendar-ics/index.ts`
- **Edited**: `lesson-booking-confirmation.tsx`, `lesson-reminder.tsx`, and the three sender edge functions above.

## Open Question
Should I also add the calendar buttons to the **group class enrollment confirmation** email (for the 8-week sessions), or keep it lesson-only for now?
