# Clarify payment status in enrollments views

## The problem

Each swim enrollment has **two independent payment fields**:

| Field | What it covers | Amount |
|---|---|---|
| `payment_status` | Registration fee (swim bag/cap/goggles) | $45 |
| `session_fee_status` | Session tuition (8 lessons) | $240 |

Today the UI only shows the first one as a single badge labeled "paid" — so Michelle Prieto's daughter Eliza Montes shows **paid** even though her $240 session fee is still `due_day_1`. That's misleading on both:

1. **By Sessions view** (`SessionEnrollmentCards.tsx`) — single badge, `payment_status` only.
2. **Swim Enrollments table** — has separate columns, but the inline badge in the swimmers-expanded row only shows `payment_status`.

## Fix

### 1. By Sessions card (`src/components/admin/SessionEnrollmentCards.tsx`)
Replace the single `payment_status` badge per swimmer with **two compact badges** stacked or side-by-side:

```
Eliza Montes  (Michelle Prieto)   [Reg: paid] [Session: due day 1]
```

Color rules:
- `paid` → green
- `due_day_1` → amber
- `unpaid` → amber
- `not_required` / `waived` → muted gray
- `refunded` → red
- `comp` → blue

Add `session_fee_status` to the `Enrollment` interface and pass it through from `SwimEnrollmentsAdmin.tsx` (already queried — just include it in the prop).

Add a small **legend / tooltip** at the top of the by-sessions panel explaining: "Reg = $45 registration fee · Session = $240 tuition".

### 2. Swim Enrollments table — expanded swimmer rows
Wherever the inline `payment_status` badge appears alongside a swimmer (around line 805 in `SwimEnrollmentsAdmin.tsx`), render both badges with the prefix `Reg:` / `Session:` so they match the by-sessions view.

### 3. Status label normalization
Show friendlier labels (instead of raw enum values):
- `due_day_1` → "Due day 1"
- `not_required` → "N/A"
- everything else → capitalized as-is

Centralize in a tiny helper (`src/lib/paymentLabels.ts`) so both views stay in sync.

## Files to change

- `src/components/admin/SessionEnrollmentCards.tsx` — add session fee badge, update interface, add legend
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — pass `session_fee_status` to `SessionEnrollmentCards`; update inline badge in swimmers row to show both
- `src/lib/paymentLabels.ts` — new helper for label + color

## Out of scope

No DB changes, no logic changes — display only.
