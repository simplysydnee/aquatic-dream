## Bug
Stripe rejects the checkout session with:
> The `expires_at` timestamp must be less than 24 hours from Checkout Session creation.

Two edge functions still set `expires_at` to **30 days** in the future, which exceeds Stripe's hard 24h cap:

1. `supabase/functions/send-lesson-booking-confirmation/index.ts` — line ~80: `Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60`
2. `supabase/functions/create-lesson-occurrence-checkout/index.ts` — line ~52: same 30‑day value

`send-lesson-series-confirmation` was already fixed to 23h in a prior round, which is why only the single‑occurrence "Email payment due" button errors out.

## Fix
Change both `expires_at` values to **23 hours** (the largest safe value under Stripe's 24h limit, matching the series function for consistency):

```ts
expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
```

Update the comment above each line to reflect the real Stripe constraint (24h max, using 23h for safety) instead of the misleading "30‑day" comment.

## Trade‑off the user should know
Stripe's 24h cap is non‑negotiable on standard Checkout Sessions. After 23h the link expires and the parent has to be re‑sent a fresh one. If parents commonly take longer than a day to pay, the better long‑term answer is to switch from Checkout Sessions to **Stripe Payment Links** (no expiry) — but that's a separate, larger change. For now, 23h restores the button.

## Files changed
- `supabase/functions/send-lesson-booking-confirmation/index.ts`
- `supabase/functions/create-lesson-occurrence-checkout/index.ts`

No DB or frontend changes needed.