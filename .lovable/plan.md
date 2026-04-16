

## Fix: 404 After Stripe Payment

### Root cause
The Stripe checkout `returnUrl` is set to `/enroll?step=done&session_id={CHECKOUT_SESSION_ID}`, but the actual route defined in `App.tsx` is `/swim-enrollment`. After payment, Stripe redirects to `/enroll` which doesn't exist — hence the 404.

### Fix
Update the return URL in two places to use the correct route `/swim-enrollment`:

**File 1: `src/components/swim-enrollment/EnrollmentCheckout.tsx`** (line 26)
- Change `/enroll?step=done` → `/swim-enrollment?step=done`

**File 2: `supabase/functions/create-checkout/index.ts`** (line 52, fallback URL)
- Change `/enroll?step=done` → `/swim-enrollment?step=done`

Two-line fix. No other changes needed.

