
The user wants two things:
1. Fix the incorrect counts on the "Enrolled (Unpaid)" and "Paid" summary cards.
2. Rethink what summary data is most useful for the swim school owner.

## Investigation

Looking at `SwimEnrollmentsAdmin.tsx`:

```ts
const unpaidCount = enrollments.filter((e) => e.payment_status === "unpaid" && e.status === "enrolled").length;
const paidCount = enrollments.filter((e) => e.payment_status === "paid").length;
const cancelledCount = enrollments.filter((e) => e.status === "cancelled").length;
```

**Bug found:** The default `status` in the DB is `'confirmed'` (per `swim_enrollments` schema), NOT `'enrolled'`. The status dropdown in the UI also only offers `enrolled` / `cancelled`, but newly inserted rows from checkout get `confirmed`. So `unpaidCount` filters by `status === "enrolled"` and matches almost nothing. That's why the cards look wrong.

Also, `paidCount` counts ALL paid rows including cancelled ones, and ignores `waived`. And there's no count for first-time swimmers who pay in person on day 1 (a key operational number).

## Fix plan

### 1. Fix the count bugs
- Treat `status IN ('confirmed', 'enrolled')` as "active" everywhere (the codebase has drift between the two).
- Unpaid card: active enrollments where `payment_status = 'unpaid'`.
- Paid card: active enrollments where `payment_status IN ('paid', 'waived')`.
- Cancelled card: `status = 'cancelled'` (unchanged).

### 2. Rethink summary cards — what the owner actually needs

Replace the 3 cards with **4 owner-focused metrics** in a responsive grid:

| Card | Value | Why it matters |
|---|---|---|
| **Active Swimmers** | count of active enrollments | Headline number — who's actually in the program |
| **Revenue Collected** | sum of `payment_amount` for paid+active | Money in the bank for the current view |
| **Outstanding Balance** | sum of `payment_amount` for unpaid+active, split: returning (owe now) vs first-time (pay day 1) | Most actionable — who still owes money |
| **Capacity Used** | active enrollments / total seats across all active sessions, as `X / Y (Z%)` | How full the program is |

Add a small secondary row of mini-stats below (text only, no cards):
- `Cancelled: N` · `Refunded: N` · `Waived: N` · `First-time on roster: N`

### 3. Make cards filter-aware
Currently the cards ignore the active filter selections. Compute card values from `filtered` (when any filter is active) and from `enrollments` (when "all"), so the owner can see, e.g., totals for just Session 2 or just one class.

### 4. Files touched
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — replace the summary section, add helpers for revenue/capacity math, fix the status filter bug. Pull `session_price` + `registration_fee` into the calculations (already on enrollment as `payment_amount`).

### Out of scope
- Charting / trend lines over time (can add later if useful).
- Session-level capacity drilldown (already exists in the "By Session" tab).
