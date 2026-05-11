import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStripeClient, type StripeEnv } from '../_shared/stripe.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { occurrenceId, environment, returnUrl } = await req.json()
    if (!occurrenceId) return json({ error: 'occurrenceId required' }, 400)

    const { data: occ, error: occErr } = await supabase
      .from('lesson_booking_occurrences')
      .select('*, lesson_bookings(*)')
      .eq('id', occurrenceId)
      .maybeSingle()

    if (occErr || !occ) return json({ error: 'Occurrence not found' }, 404)
    if (occ.payment_status === 'paid') return json({ error: 'Already paid' }, 400)

    const booking = (occ as any).lesson_bookings
    if (!booking) return json({ error: 'Parent booking missing' }, 500)

    const price = Number(booking.price_per_session)
    if (!price || price <= 0) return json({ error: 'Invalid price' }, 400)

    const env: StripeEnv = environment === 'live' ? 'live' : 'sandbox'
    const stripe = createStripeClient(env)

    const lessonTypeLabel = booking.lesson_type === 'private' ? 'Private Lesson' : 'Semi-Private Lesson'
    const occDate = new Date(occ.occurrence_date + 'T00:00:00')
    const lessonDateLabel = occDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${lessonTypeLabel} — ${lessonDateLabel}`,
            description: `${booking.child_name || booking.parent_name}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      ui_mode: 'embedded',
      // Stripe default expiry is 24h; extend to 30-day max for parity with
      // emailed links — admins may open this dialog days after creation.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      return_url: (returnUrl || 'https://aquaticdreamsswim.com/admin') + '?lesson_paid=1&session_id={CHECKOUT_SESSION_ID}',
      customer_email: booking.parent_email || undefined,
      metadata: {
        type: 'lesson_booking_occurrence',
        occurrenceId: occ.id,
        bookingId: booking.id,
      },
    })

    return json({ clientSecret: session.client_secret })
  } catch (err: any) {
    console.error('create-lesson-occurrence-checkout error', err)
    return json({ error: err?.message || 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
