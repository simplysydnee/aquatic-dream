# Summer to fall Swimbership announcement

One-time, manually fired SMS blast. Nothing automatic, nothing on a cron or webhook.

## What the data says right now

Ran the audience query against live data.

Recipients after dedupe by last 10 phone digits and after excluding active, pending_cancel, and paused membership phones:

| Segment | Phone groups |
| --- | --- |
| GROUP only | 47 |
| PRIVATE only (includes semi-private only) | 51 |
| BOTH | 7 |
| **Total** | **105** |

8 phone numbers were excluded as already-converted members. 3 lesson_bookings rows are semi-private, and they fold into GROUP messaging as you called it.

Also found, and this changes the plan:

- **`src` is dropped today.** `JoinMembership.tsx` never reads a `src` param, and line 737 hardcodes `source: "public"` on the membership payload. So `/join?src=summer2026` is safe to visit, nothing breaks and no route depends on it, but it is **not** traceable to the membership record. That has to be fixed or the tracking claim is false. This is the same fix already written into the pending welcome-back plan, so the two need to ship together or the `src` work gets done twice.
- **Names are dirty enough to send bad texts.** Real examples pulled from the query: parent first name "Julia Tejeda" and "Amanda Kang" (full name landed in the first-name column), child "Doubleevkid", several rows where child name equals parent name ("Araseli" / "Araseli", "Carlos" / "Carlos", "Maria" / "Maria"), and one group of `{Karina, Karina}` where dedupe missed because `lesson_bookings.child_name` has no last-name column to key on. Sending as-is produces "thank you for swimming with us this summer with Doubleevkid."

## Build

**1. A single admin-run list builder, no new automation.** One edge function, `build-summer2026-outreach`, admin-JWT gated, that returns the computed list and rendered messages. It sends nothing. Segmentation exactly as specified: swim_enrollments on sessions starting 2026-06-08 and 2026-07-13 with status not cancelled for GROUP, lesson_bookings private and semi-private with status not in cancelled or abandoned for PRIVATE, union deduped on the last 10 digits, minus any phone matching a membership in active, pending_cancel, or paused.

**2. Name hygiene gate.** Per phone group, a row is only sendable when it has a clean parent first name and at least one clean child first name. A name is rejected when it is blank, when the parent first name and a child name are identical, or when it matches a junk pattern. Parent first name is taken as the first whitespace token of the cleaned name, so "Julia Tejeda" renders "Julia". Child names dedupe on lowercased first plus last, falling back to the whole trimmed string for `lesson_bookings`. Anything that fails the gate is **not sent**, it drops into the manual-review report alongside the no-phone families.

**3. Child list rendering.** One name, two joined with "and", three or more with the oxford comma. No em dash or en dash anywhere in the copy, only periods and commas. Your three drafts used verbatim.

**4. `src` plumbing so the link is traceable.** `src` captured on first arrival at `/join`, held in `sessionStorage`, appended to the Stripe `returnUrl` and to the group-hold continue link, and sent as the membership `source` instead of the hardcoded `"public"`. Every swimmer in a multi-kid batch gets attributed, not just the first.

**5. Sending is a separate, explicit action per segment.** A `send-summer2026-outreach` function that takes an explicit segment and an explicit list of phone numbers, sends via the existing TextMagic helper, and logs every send to `reminder_logs` with kind `summer2026_outreach`. It refuses to run without a segment named and refuses to re-send to a phone already logged for that kind. It is never called by anything but a person clicking a button.

## Before anything sends

Two reports, both handed to you first:

- **Final counts and 5 real rendered messages per segment**, actual names out of the database, so you read the exact text.
- **Cannot-text list**, by name, email, and program. First pass shows roughly 10 group families and 2 private families with no usable phone on any row. Two of them, Marena and Fadwa, also appear with a phone on a different row, so the report cross-checks by email before declaring anyone unreachable, and those get texted normally rather than listed.

## Not touched

No changes to `get-open-slots`, which reads its own params and safely ignores unknown ones. No changes to pricing, hold flow, or checkout logic beyond the single `source` value. No membership rows written.

## Verification

- Total after dedupe and exclusion reported and matched against a hand count before any send.
- Zero recipients hold an active, pending_cancel, or paused membership.
- Grep the rendered output for em dash, en dash, and the words "there", "your swimmer", and any brace placeholder: none present.
- Every family failing the name gate appears in the report and in no send batch.
- A test enrollment through `/join?src=summer2026` lands `source = summer2026` on the membership row, and a 2-kid batch lands it on both.
