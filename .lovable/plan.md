## Diagnosis
Edits from the Clients page **do** save to the database. The UI just shows stale data because:

1. In `SwimmerDetailDrawer.tsx` (line 442), `onSaved={() => setEditOpen(false)}` only closes the edit dialog — it never refetches the swimmer list.
2. In `ClientsAdmin.tsx`, the drawer's `swimmer={selected}` is a snapshot taken when the row was clicked. Even when `useSwimmers` refreshes (via realtime), `selected` keeps pointing at the old object, so the drawer keeps rendering the old name/email/phone.
3. Realtime also isn't enabled on `lesson_bookings`, so edits to a private-lesson swimmer never trigger an automatic refresh anywhere.

Result: user types new values → save succeeds → drawer/list still show the old values → looks like nothing saved.

The calendar's `CalendarBlockDetail` already handles this correctly by wiring `onSaved={onRefetch}`. We mirror that pattern.

## Fix
- `SwimmerDetailDrawer.tsx`: add an optional `onChanged?: () => void` prop and pass it as `onSaved` to `EditSwimmerDialog` (along with closing the dialog).
- `ClientsAdmin.tsx`: pass `onChanged={refetch}` to the drawer; after refetching, re-derive `selected` by looking up the same `key` in the refreshed `swimmers` array so the open drawer immediately shows new values. Use a `useEffect` keyed on `swimmers` + `selected?.key` to keep `selected` in sync with the live list.
- Enable Supabase realtime on `public.lesson_bookings` so private-lesson edits (and other tabs that depend on it) also auto-refresh.

## Files
- `src/components/admin/clients/SwimmerDetailDrawer.tsx`
- `src/pages/admin/ClientsAdmin.tsx`
- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_bookings;`

## Out of scope
- Schema/RLS — both are fine; the row really does update. No backend changes beyond enabling realtime.