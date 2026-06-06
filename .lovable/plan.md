## Diagnosis

Taylen Tickenoff's booking (`929b15d6-c1cb-447b-9661-1ab87000d695`, parent `sydnee@icanswim209.com`, self-serve, $50 Mon 3:00–3:30, weekly Jun 9 / 16 / 23 / 30) was created correctly:

- `lesson_bookings.status = 'active'`
- `stripe_payment_method_id = pm_1TfOMn2HpbBBx5lsDMhtBsXy`
- 4 scheduled occurrences with `payment_status = card_on_file`

That state can only be reached inside `confirm-private-booking`, so it ran end‑to‑end. But there is **no row whatsoever** in `email_send_log` for this booking (we checked by `message_id LIKE '%929b15d6%'` and by recipient email). The pgmq queue and DLQ are both empty, and the email cron is healthy (353 successful runs in the last 30 min).

That means the call from `confirm-private-booking` → `send-transactional-email` either never reached the function body, or it returned an error response — and the existing code swallows it:

```ts
try {
  await supabase.functions.invoke('send-transactional-email', { body: { ... } })
} catch (e) {
  console.error('confirmation email failed', e)
}
```

`supabase.functions.invoke()` does **not throw** on non-2xx responses — it returns `{ data, error }`. So if the function returned 401/404/500, the `try/catch` never fires, `error` is never inspected, and nothing is logged anywhere we can see (and the function shows no logs in our tooling for this call).

The same swallow-and-forget pattern exists in `admin-create-private-booking`'s `sendConfirmationEmail`, so admin manual bookings will silently fail to email in the same way.

## Fix

### 1. `confirm-private-booking/index.ts` — make the email call loud and reliable

Replace the silent invoke with an inspected invoke and persist any failure to the booking so we can detect and resend:

```ts
const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
  'send-transactional-email',
  {
    body: {
      templateName: 'lesson-booking-confirmation',
      recipientEmail: b.parent_email,
      idempotencyKey: `private-booking-${booking_id}`,
      templateData: { /* unchanged */ },
    },
  },
)
const apiErr = (invokeData as any)?.error
if (invokeErr || apiErr) {
  console.error('confirmation email failed', {
    booking_id,
    recipient: b.parent_email,
    invokeErr,
    apiErr,
  })
  await supabase.from('lesson_bookings').update({
    confirmation_email_status: 'failed',
    confirmation_email_error: String(invokeErr?.message || apiErr || 'unknown'),
  }).eq('id', booking_id)
} else {
  await supabase.from('lesson_bookings').update({
    confirmation_email_status: 'sent',
    confirmation_email_sent_at: new Date().toISOString(),
  }).eq('id', booking_id)
}
```

Schema add (migration):

```sql
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_status text,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_email_error text;
```

### 2. New edge function `resend-private-booking-confirmation`

Admin-only. Takes `{ booking_id }`, loads booking + occurrences, builds the exact same `templateData`/calendar links as `confirm-private-booking`, invokes `send-transactional-email`, inspects the response, and updates `confirmation_email_status` on the booking. Reused by:
- The admin "Resend confirmation" button (any booking, self-serve or admin).
- A one-off call now to backfill Taylen's booking.

This also unifies the duplicated email-building code currently sitting in both `confirm-private-booking` and `admin-create-private-booking`.

### 3. `admin-create-private-booking/index.ts`

Same invoke-inspection treatment in `sendConfirmationEmail`. Existing `resend_confirmation_for` path keeps working — it can either continue to call `sendConfirmationEmail` (now fixed) or delegate to the new `resend-private-booking-confirmation` function for one code path.

### 4. Admin UI — `PrivateLessonDetailDialog`

It already has a resend control; wire it to call `resend-private-booking-confirmation` and surface `confirmation_email_status`/`confirmation_email_error` as a small badge ("Email sent 2:30 PM" / "Email failed — Retry").

### 5. Backfill Taylen's booking

Once the new function deploys, call it once with `booking_id = 929b15d6-c1cb-447b-9661-1ab87000d695` so Sydnee gets the confirmation email she's missing.

## Why not "just enqueue to pgmq directly"

`send-transactional-email` is the gate that checks suppression, builds the unsubscribe token, renders the React template, and writes the `email_send_log` "pending" row before enqueueing. Bypassing it would skip suppression checks and break analytics. The right fix is to make the call to it observable and recoverable.

## Out of scope

- Re-architecting auth/JWT between edge functions — current service-role-key client works for every other caller (e.g. `notify-schedule-published`, the cancellation refund flow). The failure here is the silent error handling, not the transport.
- Changes to the public booking UI — the flow ran correctly; only the post-booking email pipeline is fixed.
