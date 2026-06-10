
# Admin Booking — Unified Client-First Wizard

Rebuild the manual admin booking flow so staff follow one consistent path: **Client → Booking Type → Slot(s) → Review & Book**. Replace the current cramped single-dialog form everywhere it appears, and add a roomier full-page version for new-client / recurring bookings.

## Goals

- One mental model for booking Private, Semi-Private, or Group Class.
- Client selected first (search existing or create new inline).
- For recurring private/semi: pick the already-defined recurring slot, then deselect any dates that don't work.
- Quick path stays fast; deep path handles new clients & long series.

---

## UX Flow

```text
┌──────────────────────────────────────────────────────────┐
│  Step 1  CLIENT                                          │
│  ───────────────────────────────────────────────────     │
│  [ Search name / email / phone ............... ]         │
│   Recent: ( Jane D. ) ( Marco S. ) ( + chips )           │
│   ── results ──                                          │
│   • Jane Doe  jane@x.com  · 2 swimmers ▸                │
│   • Marco Suarez  …                                      │
│                                                          │
│   ─ or ─  [ + Create new client ]                        │
│   (inline drawer: parent + swimmer + dob + phone)        │
└──────────────────────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────────────────────┐
│  Step 2  BOOKING TYPE                                    │
│  ───────────────────────────────────────────────────     │
│  ( Private )  ( Semi-Private )  ( Group Class )          │
│  Selected swimmer(s): Lily Doe (age 6) [change]          │
│  Semi-private → add 2nd swimmer field                    │
└──────────────────────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────────────────────┐
│  Step 3  SLOT                                            │
│  ───────────────────────────────────────────────────     │
│  PRIVATE / SEMI:                                         │
│   ▸ Recurring slot picker (instructor × weekday × time)  │
│     [ Coach Sam · Tue 4:00p · 30 min · shallow ]         │
│     [ Coach Mia · Thu 5:30p · 30 min · shallow ]         │
│     ─ one-time slot? [ Pick custom date/time ]           │
│                                                          │
│   After slot chosen → show generated dates with          │
│   checkbox per date. Default all on. Staff can           │
│   uncheck dates that don't work for the client.          │
│      ☑ Tue Jun 17                                        │
│      ☑ Tue Jun 24                                        │
│      ☐ Tue Jul 1  (skipped)                              │
│      ☑ Tue Jul 8 …                                       │
│   Summary: "6 lessons · first Jun 17 · last Jul 29"      │
│                                                          │
│  GROUP CLASS:                                            │
│   Filter by level + day → list of active sessions with   │
│   open seats. Pick session → confirm.                    │
└──────────────────────────────────────────────────────────┘
            ↓
┌──────────────────────────────────────────────────────────┐
│  Step 4  REVIEW & PAYMENT                                │
│  ───────────────────────────────────────────────────     │
│  Client, swimmer(s), instructor, dates, price/lesson,    │
│  totals, waiver-on-file pill, notes.                     │
│  Card on file (toggle), Send confirmation (toggle).      │
│  [ Book ] → embedded Stripe SetupIntent if needed.       │
└──────────────────────────────────────────────────────────┘
```

A persistent left rail shows the 4 steps with current selections; staff can jump back to any completed step.

---

## Entry Points

- **Full-page wizard** at `/admin/private-lessons/new` (and a "Book lesson" button on `PrivateLessonsAdmin` + calendar's `PrivateLessonsPanel`).
- **Quick-book dialog** keeps the same 4-step layout in a wider dialog (used from calendar day cell, open-slot click). Has a "Open full booking page →" link that hands off current state via query params.

Both share the same step components — only the chrome differs.

---

## Technical Plan

### New files
- `src/components/admin/booking/BookingWizard.tsx` — orchestrator + step rail, drives shared state.
- `src/components/admin/booking/steps/ClientStep.tsx` — search (`useSwimmers`-style across `lesson_bookings`, `swim_enrollments`, `marketing_contacts` by name/email/phone), recent chips, inline "Create new" drawer.
- `src/components/admin/booking/steps/BookingTypeStep.tsx` — Private / Semi-Private / Group toggle + swimmer selection (adds 2nd swimmer field for semi).
- `src/components/admin/booking/steps/SlotStep.tsx` — switches on type:
  - Private/Semi: list recurring blocks via `get_public_booking_blocks` filtered by available slots from `fetchOpenSlots`. After pick, generate occurrence dates (weekly between today and `series_end`) with checkbox grid for deselect.
  - Group: query `swim_sessions` joined with `get_session_enrollment_counts` for capacity.
  - "Custom one-time" sub-mode reuses `useAvailableSlots`.
- `src/components/admin/booking/steps/ReviewStep.tsx` — totals using `getPrivateLessonPrice` (June promo aware), card-on-file + confirmation toggles, submit handler.
- `src/pages/admin/BookingNew.tsx` — full-page route wrapping `BookingWizard`.
- `src/components/admin/booking/BookingQuickDialog.tsx` — dialog wrapper around `BookingWizard` with a "Open full page" link.

### Reused
- Edge fns: `admin-create-private-booking-setup`, `admin-create-private-booking`, `admin-create-enrollment` (group).
- Helpers: `fetchOpenSlots`, `useAvailableSlots`, `getPrivateLessonPrice`.
- Stripe embedded SetupIntent (same as current dialog).

### Slot occurrence generation
Use selected block's `day_of_week` + `slot_minutes` + chosen series window (default = block window, capped at 12 weeks). Build dates list, render as `<Checkbox>` grid. Pass the **kept dates only** to `admin-create-private-booking` as an explicit `occurrence_dates: string[]` payload — extend the edge fn to accept that array (when present, skip its internal weekly expansion and insert exactly those dates).

### Touch-points to retire / redirect
- `AdminBookPrivateLessonDialog` → keep as thin wrapper that mounts the new wizard for one release, then remove once calendar/admin call sites are migrated.
- Calendar `PrivateLessonsPanel` "Book Lesson" button → opens `BookingQuickDialog`.
- `PrivateLessonsAdmin` top-right "Book lesson" → routes to `/admin/private-lessons/new`.

### State shape (shared)
```ts
type BookingDraft = {
  client: { id?: string; parent: {...}; swimmers: Swimmer[] };
  type: "private" | "semi_private" | "group";
  slot:
    | { mode: "recurring"; blockId; instructorId; weekday; time; durationMin; poolArea; dates: string[] /* kept */ }
    | { mode: "one_time"; instructorId; date; start; end; poolArea }
    | { mode: "group"; sessionId };
  payment: { collectCardOnFile: boolean; sendConfirmation: boolean; priceOverride?: number };
};
```

### No DB schema changes required (uses existing tables and RPCs). One edge-fn tweak only: `admin-create-private-booking` accepts optional `occurrence_dates`.

---

## Out of scope

- Public/parent-facing booking flow (unchanged).
- Editing existing bookings (still done via `PrivateLessonDetailDialog`).
- Waiver capture inside the wizard — flag waiver status only; signing stays in existing waiver flow.
