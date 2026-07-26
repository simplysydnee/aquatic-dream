## What I found in the data

These bookings were created with **no `stripe_customer_id` / `stripe_payment_method_id`**, so their lesson occurrences are `payment_status = unpaid`, `charge_status = skipped` and cannot be charged:

| Family | Booking(s) | Prior card in our records? |
|---|---|---|
| Karanveer Singh (Paramdip Singh) | Jul 18 / Jul 25 / Aug 1 | Yes — `pm_...eBcQ0lnO` on the Jun 13 booking |
| Nanak Singh (Gurpreet Singh) | Jul 28, 30, Aug 4, Aug 6 | Yes — `pm_...PQ28eGBg` on the Jul 23 booking |
| Leonel Valencia Perez | Jul 23, Jul 28, Jul 30 | Yes — `pm_...SBIZRWA0` on earlier bookings |
| Mustafa Ziadeh | Aug 4 (`pending_card`) | Yes — `pm_...N1MKK9kr` on earlier bookings |
| Aiden Carrera (Lizvett Leon) | Jul 16, 23, 30 | No card anywhere in our DB |
| Laine Price (Alex Tompkins-Price) | Jul 21 (+2 older `pending_card` rows) | No payment method saved; only a Stripe customer id `cus_UlV...` |

So there are two distinct problems: **(1)** a card we already have was not carried onto the new booking, and **(2)** for Aiden and Laine we may never have captured one (or it was captured in Stripe but never written back).

## Root cause

The reuse helper (`_shared/card-on-file.ts`) only looks at other `lesson_bookings` rows in our database, and it is only invoked when an admin explicitly clicks the reuse banner. New bookings created without that click get no card, even when the same parent email already has a valid one. Nothing repairs them afterwards.

## The fix

**1. Make the card lookup also ask Stripe directly**
Extend `findReusableCardForEmail` so that when no usable payment method is found on our own booking rows, it falls back to: find the Stripe customer by email (or by a `stripe_customer_id` already on any of that parent's bookings), list their attached card payment methods, and use the newest unexpired one. This is what will recover Laine Price and, if a card exists there, Aiden Carrera.

**2. Add a repair action to `admin-setup-card-for-booking`**
New `action: "repair"` that, for a given booking, runs the extended lookup and — when a valid card is found — stamps `stripe_customer_id` + `stripe_payment_method_id` on the booking and flips its non-cancelled, non-paid occurrences to `payment_status = card_on_file`, `charge_status = pending`. This reuses the existing attach logic and stays admin-gated. No charges are made by this action.

**3. Run the repair for the six bookings above**
Executed through the edge function against live Stripe. Expected outcome: the four Singh/Valencia/Ziadeh families flip to "Card on file" immediately. Aiden and Laine flip only if Stripe actually holds a card; if not, the repair reports "no card found" for them.

**4. Fallback for anyone with no card in Stripe**
For those families, use the existing "Send card-on-file link" flow (`admin-card-on-file-link`) so the parent saves a card, which then makes their lessons chargeable. Laine's two outstanding lessons become chargeable once that lands.

**5. Prevent the recurrence**
When a booking is created for a parent email that already has a valid reusable card, attach it automatically instead of waiting for the admin to notice the reuse banner. The admin can still replace the card from the lesson detail dialog.

## Notes

- No existing rows are deleted, no RLS changes, no schema changes.
- All Stripe calls stay inside edge functions; nothing is charged as part of this repair.
- Laine's charge for two lessons is done afterwards through the normal charge dialog once her card is on file.
