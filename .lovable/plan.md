## Problem

On a swimmer's card (Clients → swimmer drawer → **Activity**), booked **private** and **semi-private** lessons are missing in two cases:

1. The parent has a session enrollment AND a private/semi booking, but the booking does not merge onto the same swimmer because the names don't match exactly (extra/double whitespace, "Arthur" vs "Arthur Sidell", different casing, etc.).
2. The parent only has private/semi bookings (no session enrollment). For many semi-private rows the booking's `child_name` is actually the **parent's** name (the `child_first_name`/`child_last_name` columns are null), so the swimmer ends up listed under the parent, or the real child never gets a card at all.

Both stem from `useSwimmers` keying swimmers on a naïve `child_name|parent_email` and never reconciling bookings against existing enrollment-derived swimmers.

## Fix (frontend only, in `src/hooks/useSwimmers.ts`)

### 1. Normalize names before keying
- Lowercase, trim, **collapse internal whitespace**, and strip punctuation.
- Use a `child_first_name + child_last_name` based key when those columns exist; fall back to `child_name`.
- Apply the same normalization to enrollments, requests, and bookings.

### 2. Two-pass merge for bookings
- Pass 1: build the swimmer map from enrollments + requests as today.
- Pass 2 (bookings): before creating a new swimmer for a booking, try to attach it to an existing swimmer for the same parent_email when either:
  - normalized full name matches, OR
  - normalized first name matches and last name is empty/contained, OR
  - the booking has no real child name (semi-private case where `child_first_name`/`child_last_name` are null AND `child_name` equals the parent's name) AND the parent has exactly one existing swimmer → attach to that swimmer.
- Only fall through to creating a new swimmer card when no reasonable parent match exists.

### 3. Use the cleaner display name
- When a booking has `child_first_name` + `child_last_name`, prefer that over the looser `child_name` for the swimmer's display name.

### 4. Activity tab ordering (`SwimmerDetailDrawer.tsx`)
- Sort `swimmer.bookings` newest-first by `series_start` (fallback `created_at`) so the most recent booking shows on top — small consistency fix while we're in there.

No backend / RLS / schema changes needed. No edits to enrollment, payment, or checkout logic.

## Verification

- Open a parent who has only private bookings → confirm one swimmer card per real child, all bookings listed under **Activity → Lessons & Requests**.
- Open a parent who has both an enrollment and a private booking for the same child → confirm the booking now appears on the same card as the enrollment (no duplicate card).
- Open a semi-private booking where `child_name` was the parent's name → confirm it attaches to the single existing child swimmer for that parent instead of creating a duplicate parent-named card.
