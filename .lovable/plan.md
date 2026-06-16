## Fix `admin-charge-private-lesson-occurrence` edge function

### Changes to `supabase/functions/admin-charge-private-lesson-occurrence/index.ts`

Replace the single `update(...)` block after the Stripe `paymentIntents.create` call with:

**Write 1 — charge record (always runs, success or failure):**
```ts
await supabaseAdmin.from("lesson_booking_occurrences").update({
  charge_status: succeeded ? "succeeded" : "failed",
  charge_attempted_at: new Date().toISOString(),
  stripe_payment_intent_id: pi.id,
  charge_error: succeeded ? null : `Status: ${pi.status}`,
}).eq("id", row.id);
```

**Write 2 — payment stamp (only on success):**
```ts
if (succeeded) {
  await supabaseAdmin.from("lesson_booking_occurrences").update({
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    payment_method: "card_on_file",
  }).eq("id", row.id);
}
```

Failure path unchanged: return 402 with `Charge ${pi.status}`. Success path unchanged: return `{ success: true, payment_intent_id: pi.id }`.

### Why two writes
If write 2 ever fails (schema drift, transient error), the `charge_status=succeeded` + `stripe_payment_intent_id` row already exists, so a retry can detect the prior PaymentIntent and reconcile instead of double-charging.

### Deploy
Redeploy `admin-charge-private-lesson-occurrence` via the deploy tool after the edit.

### Out of scope
No client changes, no DB changes, no other edge functions, no refactor of the cron `charge-private-lesson-occurrence` (separate item if needed).
