

## Add Payment Status & Send Payment Link to Calendar Block Detail

### What changes
The `CalendarBlockDetail.tsx` roster cards currently show check-in, parent contact, and emergency contact. We'll add:

1. **Payment status badge** on each enrollment card (paid/unpaid) — green for paid, yellow for unpaid
2. **"Send Payment Link" button** on unpaid enrollments — calls the existing `send-session-payment-link` edge function directly from the calendar panel
3. **Medical notes indicator** — small icon if medical notes exist, visible on hover

### How it works
- Each enrollment card in the roster section gets a payment status badge next to the child's name
- For unpaid enrollments, a small "Send Link" button appears that invokes `send-session-payment-link` (same logic as `EnrollmentDetailDialog`)
- Success/error feedback via toast notifications

### Technical details
- `CalendarBlockDetail.tsx`: Import `supabase` client and `useToast`
- Add `payment_status` rendering in the enrollment card (already available on `CalendarEnrollment` type)
- Add async handler for sending payment link using `supabase.functions.invoke("send-session-payment-link", ...)`
- Verify `CalendarEnrollment` type includes `payment_status` — if not, update `useCalendarData.ts` to fetch it

### Files modified
- `src/components/admin/calendar/CalendarBlockDetail.tsx` — add payment badge + send link button
- `src/hooks/useCalendarData.ts` — ensure `payment_status` and `is_first_time` are fetched with enrollments (if not already)

