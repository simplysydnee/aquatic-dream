## Goal

Add a unified **Clients** tab in the admin dashboard listing **one row per swimmer (child)** — Airtable-style — so the owner has a single searchable place to find any kid who has ever interacted with the business, with dynamic statuses pulled from lesson requests, enrollments, and bookings.

## Identity model

A "client row" = **one swimmer (child)**, identified by:
`lower(trim(child_name)) + '|' + lower(parent_email)`

This matches the dedup key already used in `enforce_first_time_swimmer`. Siblings appear as separate rows but share parent contact info (and group together visually under the parent name).

## Data sources merged per swimmer

For each swimmer, pull and attach:
- **lesson_requests** — by parent_email + child_name
- **swim_enrollments** — by parent_email + child_name (joined to `swim_sessions` + `session_periods` for date ranges)
- **lesson_bookings** — by parent_email + child_name (series_start / series_end / recurring)

## Status pills (dynamic, Airtable-like)

Each swimmer row shows a stack of pills computed live:

| Pill | When |
|---|---|
| `Lesson Requested · New / Contacted / Scheduled` | Open `lesson_requests` row exists; sub-status mirrors the request |
| `Enrolled · Active` | Has enrollment whose session_period end_date >= today |
| `Enrolled · Upcoming` | Session start_date is in the future |
| `Booking Active` | `lesson_bookings` with `series_end >= today` (or recurring + null end) |
| `Unpaid` | Active enrollment with `payment_status != 'paid'` or `session_fee_status != 'paid'` |
| `Past Client` | Only past enrollments/bookings, nothing active or pending |
| `New Inquiry` | Only a lesson request exists, no enrollments ever |

Pills recompute automatically when admin updates a request or enrollment.

## Page layout (`/admin/clients`)

```
┌─ Clients ───────────────────────────────────────────────┐
│  [Search: swimmer, parent, email, phone]   [Filter ▾]   │
│  Chips: All | New Inquiry | Active | Upcoming |         │
│         Unpaid | Past | Has Request                     │
│                                                          │
│  ┌─ Row per swimmer ────────────────────────────────┐   │
│  │ Logan Yarick (3) · Preschool                     │   │
│  │ Parent: Vikki Yarick · vblansit@gmail.com        │   │
│  │ [Enrolled · Spring '26] [Paid]                   │   │
│  │ Last activity: Apr 28, 2026                      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Ryker (16) · —                                    │   │
│  │ Parent: Sutton Lucas · aquaticdreamsca@gmail.com │   │
│  │ [Lesson Requested · New] [Private]                │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

Click a row → **Swimmer Detail Drawer** with tabs:
- **Overview** — child info (name, age, DOB, level, medical notes), parent contact, current status pills, sibling links (other swimmers under same parent email)
- **Timeline** — chronological feed: every request, enrollment, booking, payment for this swimmer
- **Quick actions** — open underlying `LessonRequestDetailDialog` or `EnrollmentDetailDialog`

Default sort: most recent activity first. Sortable columns: name, age, last activity, status.

## Search behavior

Single search box matches against: swimmer name, parent name, parent email, parent phone. Debounced, client-side over the merged list.

## Technical implementation

**New files**
- `src/pages/admin/ClientsAdmin.tsx` — page
- `src/components/admin/clients/SwimmerRow.tsx` — single swimmer row
- `src/components/admin/clients/SwimmerDetailDrawer.tsx` — side drawer with Overview + Timeline tabs
- `src/components/admin/clients/SwimmerStatusBadges.tsx` — pill renderer
- `src/hooks/useSwimmers.ts` — fetches the 3 tables in parallel, builds `Map<swimmerKey, SwimmerRecord>`, computes statuses, exposes `{ swimmers, loading, refetch }`

**Edited files**
- `src/components/admin/AdminSidebar.tsx` — add `Clients` nav item (icon: `Users` or `IdCard`), route `/admin/clients`, placed just above "Swim Enrollments"
- `src/App.tsx` — register `<Route path="clients" element={<ClientsAdmin />} />` inside the `/admin` block

**Data fetching**
- 3 parallel `supabase.from(...)` selects on `lesson_requests`, `swim_enrollments` (joined to `swim_sessions(...session_periods(*))`), `lesson_bookings`.
- Merge in JS: build `Map<childKey, SwimmerRecord>` keyed by `lower(name)|lower(email)`.
- Status computation pure — runs every render off merged data.
- Realtime: subscribe to `lesson_requests` and `swim_enrollments` postgres_changes so pills stay live without refresh.

**No DB schema changes** — pure read/aggregation. No migration.

**Reuse existing dialogs** — clicking a request entry opens `LessonRequestDetailDialog`; clicking an enrollment opens `EnrollmentDetailDialog`. Status updates inside those trigger refetch via realtime.

## Out of scope (this pass)
- Editing swimmer/parent contact info from this view (lives on underlying rows)
- Merging duplicates with mismatched name spellings
- Per-swimmer notes/tags (would need a new `swimmer_notes` table — possible follow-up)

## Summary
One new admin page listing one row per swimmer, with dynamic status pills aggregated from lesson requests + enrollments + bookings. ~5 new files, sidebar entry, one route. No DB changes. Reuses existing detail dialogs.